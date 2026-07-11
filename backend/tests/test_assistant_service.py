"""Assistant agent: the OSM search layer (Overpass nwr + polygons, category
coverage, radius widening, reverse geocoding), the tool dispatcher, and the
bounded tool-calling loop. All external HTTP (Overpass, Photon, Groq) is
faked - these are unit tests of our own control flow, not the providers."""

import asyncio
import json
import types

import httpx
import pytest

from app.models.assistant import AssistantBooking, ChatMessage, PlaceResult
from app.models.ride import LatLng
from app.services import assistant_service as svc

DHAKA = LatLng(lat=23.8103, lng=90.4125)
BANGKOK = LatLng(lat=13.7563, lng=100.5018)  # real place, well outside the BD bounding box


class FakeResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json_data = json_data
        self.text = json.dumps(json_data) if json_data is not None else ""

    def json(self):
        return self._json_data


class FakeAsyncClient:
    """Swaps in for httpx.AsyncClient - routes every post/get through a
    handler(method, url, payload) -> FakeResponse."""

    def __init__(self, handler, *_a, **_kw):
        self._handler = handler

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False

    async def post(self, url, data=None, **_kw):
        return self._handler("POST", url, data)

    async def get(self, url, params=None, **_kw):
        return self._handler("GET", url, params)


def _patch_client(monkeypatch, handler):
    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda *a, **kw: FakeAsyncClient(handler, *a, **kw))


@pytest.fixture(autouse=True)
def clear_reverse_cache():
    svc._reverse_cache.clear()
    yield
    svc._reverse_cache.clear()


# --- Overpass query construction & polygon parsing -------------------------


def test_overpass_query_uses_nwr_not_node(monkeypatch):
    captured = {}

    def handler(method, url, data):
        captured["query"] = data["data"]
        return FakeResponse(200, {"elements": []})

    _patch_client(monkeypatch, handler)
    asyncio.run(svc._query_overpass({"amenity": "university"}, DHAKA, 10, 12000))
    assert "nwr[" in captured["query"]
    assert "node[" not in captured["query"]
    assert '["amenity"="university"]' in captured["query"]


def test_overpass_query_ands_multiple_tags(monkeypatch):
    captured = {}

    def handler(method, url, data):
        captured["query"] = data["data"]
        return FakeResponse(200, {"elements": []})

    _patch_client(monkeypatch, handler)
    asyncio.run(
        svc._query_overpass({"amenity": "place_of_worship", "religion": "muslim"}, DHAKA, 10, 12000)
    )
    assert '["amenity"="place_of_worship"]' in captured["query"]
    assert '["religion"="muslim"]' in captured["query"]


def test_overpass_parses_polygon_center_and_node_lat_lon(monkeypatch):
    def handler(method, url, data):
        return FakeResponse(
            200,
            {
                "elements": [
                    {"type": "node", "lat": 23.9, "lon": 89.1, "tags": {"name": "Node Place"}},
                    {
                        "type": "way",
                        "center": {"lat": 23.95, "lon": 89.15},
                        "tags": {"name": "Campus Polygon University"},
                    },
                    # No name - should be dropped.
                    {"type": "node", "lat": 24.0, "lon": 89.2, "tags": {}},
                ]
            },
        )

    _patch_client(monkeypatch, handler)
    results = asyncio.run(svc._query_overpass({"amenity": "university"}, DHAKA, 10, 12000))
    names = {r.name for r in results}
    assert names == {"Node Place", "Campus Polygon University"}
    polygon = next(r for r in results if r.name == "Campus Polygon University")
    assert polygon.lat == 23.95
    assert polygon.lng == 89.15


def test_overpass_returns_none_on_failure_not_empty_list(monkeypatch):
    def handler(method, url, data):
        return FakeResponse(500, None)

    _patch_client(monkeypatch, handler)
    result = asyncio.run(svc._query_overpass({"amenity": "hospital"}, DHAKA, 10, 12000))
    assert result is None


# --- Progressive radius widening --------------------------------------------


def test_query_category_widens_radius_when_first_is_empty(monkeypatch):
    calls = []

    async def fake_query_overpass(tags, near, limit, radius_meters):
        calls.append(radius_meters)
        if radius_meters == svc.OVERPASS_RADII_METERS[0]:
            return []
        return [PlaceResult(name="Far University", address=None, lat=24.5, lng=89.9, distance_km=90.0)]

    monkeypatch.setattr(svc, "_query_overpass", fake_query_overpass)
    results = asyncio.run(svc._query_category({"amenity": "university"}, DHAKA, 10))
    assert calls == list(svc.OVERPASS_RADII_METERS)
    assert results[0].name == "Far University"


def test_query_category_stops_at_first_nonempty_radius(monkeypatch):
    calls = []

    async def fake_query_overpass(tags, near, limit, radius_meters):
        calls.append(radius_meters)
        return [PlaceResult(name="Close Hospital", address=None, lat=23.81, lng=90.41, distance_km=0.5)]

    monkeypatch.setattr(svc, "_query_overpass", fake_query_overpass)
    results = asyncio.run(svc._query_category({"amenity": "hospital"}, DHAKA, 10))
    assert calls == [svc.OVERPASS_RADII_METERS[0]]
    assert results[0].name == "Close Hospital"


def test_query_category_returns_empty_on_hard_failure_without_retrying_wider(monkeypatch):
    calls = []

    async def fake_query_overpass(tags, near, limit, radius_meters):
        calls.append(radius_meters)
        return None

    monkeypatch.setattr(svc, "_query_overpass", fake_query_overpass)
    results = asyncio.run(svc._query_category({"amenity": "hospital"}, DHAKA, 10))
    assert results == []
    assert calls == [svc.OVERPASS_RADII_METERS[0]]


# --- Category coverage -------------------------------------------------------


@pytest.mark.parametrize(
    "category",
    [
        "university",
        "college",
        "mosque",
        "temple",
        "church",
        "market",
        "police",
        "clinic",
        "bakery",
        "hospital",
    ],
)
def test_diverse_categories_are_known(category):
    assert category in svc.KNOWN_CATEGORIES


def test_mosque_and_temple_are_distinguished_by_religion_tag():
    assert svc.CATEGORY_TO_OSM_TAGS["mosque"] == {"amenity": "place_of_worship", "religion": "muslim"}
    assert svc.CATEGORY_TO_OSM_TAGS["temple"] == {"amenity": "place_of_worship", "religion": "hindu"}
    assert svc.CATEGORY_TO_OSM_TAGS["church"] == {"amenity": "place_of_worship", "religion": "christian"}


# --- Category query normalization ---------------------------------------------
# Tool-calling models are not reliably constrained to emit the bare category
# id (they say "nearest university" or "pharmacy near me" instead of
# "university"/"pharmacy") the way the old forced-JSON response format was -
# this is what makes resolve_places still recognize the category anyway.


@pytest.mark.parametrize(
    "phrase,expected",
    [
        ("nearest university", "university"),
        ("the nearest hospital", "hospital"),
        ("closest pharmacy", "pharmacy"),
        ("pharmacy near me", "pharmacy"),
        ("any hospital around", "hospital"),
        ("a mosque nearby", "mosque"),
        ("hospital", "hospital"),
        ("University", "university"),
        ("universities near me", "university"),
        ("hospitals", "hospital"),
        ("pharmacies", "pharmacy"),
        ("nearest churches", "church"),
        ("banks nearby", "bank"),
        # A genuinely named place that happens to end in "s" must not be
        # mistaken for a plural category and mangled.
        ("KFC Gulshan", "kfc gulshan"),
    ],
)
def test_normalize_category_query(phrase, expected):
    assert svc._normalize_category_query(phrase) == expected


def test_resolve_places_recognizes_category_wrapped_in_natural_language(monkeypatch):
    captured = {}

    async def fake_query_category(tags, near, limit):
        captured["tags"] = tags
        return [PlaceResult(name="Khwaja Yunus Ali University", address=None, lat=24.05, lng=89.55, distance_km=25.0)]

    monkeypatch.setattr(svc, "_query_category", fake_query_category)
    results = asyncio.run(svc.resolve_places("nearest university", DHAKA))
    assert captured["tags"] == {"amenity": "university"}
    assert results[0].name == "Khwaja Yunus Ali University"


# --- Reverse geocoding --------------------------------------------------------


def test_reverse_geocode_formats_address(monkeypatch):
    def handler(method, url, params):
        return FakeResponse(
            200,
            {
                "features": [
                    {
                        "properties": {
                            "name": "Khwaja Yunus Ali Medical College",
                            "street": None,
                            "district": "Sirajganj",
                            "state": "Rajshahi Division",
                        }
                    }
                ]
            },
        )

    _patch_client(monkeypatch, handler)
    address = asyncio.run(svc.reverse_geocode(24.05, 89.55))
    assert address == "Khwaja Yunus Ali Medical College, Sirajganj, Rajshahi Division"


def test_reverse_geocode_caches_second_call(monkeypatch):
    calls = []

    def handler(method, url, params):
        calls.append(1)
        return FakeResponse(200, {"features": [{"properties": {"name": "Somewhere"}}]})

    _patch_client(monkeypatch, handler)
    asyncio.run(svc.reverse_geocode(23.81, 90.41))
    asyncio.run(svc.reverse_geocode(23.81, 90.41))
    assert len(calls) == 1


def test_reverse_geocode_fails_soft_on_network_error(monkeypatch):
    def handler(method, url, params):
        raise httpx.HTTPError("boom")

    _patch_client(monkeypatch, handler)
    assert asyncio.run(svc.reverse_geocode(23.7, 90.5)) is None


# --- Bangladesh bounding box sanity check ------------------------------------


def test_in_bangladesh_accepts_dhaka():
    assert svc._in_bangladesh(DHAKA.lat, DHAKA.lng) is True


def test_in_bangladesh_rejects_kolkata():
    assert svc._in_bangladesh(BANGKOK.lat, BANGKOK.lng) is False


# --- Tool dispatcher ----------------------------------------------------------


def test_dispatch_search_places_populates_loop_state_and_indexes(monkeypatch):
    async def fake_resolve_places(query, near, limit=svc.RESULT_LIMIT):
        return [PlaceResult(name="A", address=None, lat=23.8, lng=90.4, distance_km=1.0)]

    monkeypatch.setattr(svc, "resolve_places", fake_resolve_places)
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(svc._dispatch_tool("search_places", {"query": "hospital"}, DHAKA, loop_state))
    assert result["count"] == 1
    assert result["results"][0]["index"] == 1
    assert loop_state["places"][0].name == "A"


def test_dispatch_search_places_requires_query():
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(svc._dispatch_tool("search_places", {"query": "  "}, DHAKA, loop_state))
    assert "error" in result


def test_dispatch_reverse_geocode_passenger(monkeypatch):
    async def fake_reverse_geocode(lat, lng):
        return "Gulshan, Dhaka"

    monkeypatch.setattr(svc, "reverse_geocode", fake_reverse_geocode)
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(svc._dispatch_tool("reverse_geocode_passenger", {}, DHAKA, loop_state))
    assert result["address"] == "Gulshan, Dhaka"


def test_dispatch_estimate_fare_defaults_pickup_to_passenger_location(monkeypatch):
    captured = {}

    async def fake_compute_route(origin, destination):
        captured["origin"] = origin
        return {"distance_meters": 5000, "duration_seconds": 600, "route_path": []}

    monkeypatch.setattr(svc.maps_service, "compute_route", fake_compute_route)
    monkeypatch.setattr(svc.fare_service, "get_fare_rules", lambda: {"surgeEnabled": False, "surgeCap": 2.5})
    monkeypatch.setattr(svc.surge_service, "compute_surge", lambda lat, lng, rules=None: 1.0)
    monkeypatch.setattr(
        svc.fare_service,
        "calculate_fare",
        lambda *a, **kw: {"total": 123.45},
    )

    loop_state = {"places": [], "booking": None}
    result = asyncio.run(
        svc._dispatch_tool("estimate_fare", {"dest_lat": 23.79, "dest_lng": 90.40}, DHAKA, loop_state)
    )
    assert result["fare_bdt"] == 123.45
    assert captured["origin"] == DHAKA


def test_dispatch_estimate_fare_rejects_destination_outside_bangladesh():
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(
        svc._dispatch_tool(
            "estimate_fare", {"dest_lat": BANGKOK.lat, "dest_lng": BANGKOK.lng}, DHAKA, loop_state
        )
    )
    assert "error" in result


def test_dispatch_start_booking_sets_loop_state(monkeypatch):
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(
        svc._dispatch_tool(
            "start_booking",
            {"dest_name": "Khwaja Yunus Ali University", "dest_lat": 24.05, "dest_lng": 89.55},
            DHAKA,
            loop_state,
        )
    )
    assert result["status"] == "booking_started"
    assert isinstance(loop_state["booking"], AssistantBooking)
    assert loop_state["booking"].destination.name == "Khwaja Yunus Ali University"
    assert loop_state["booking"].pickup is None


def test_dispatch_start_booking_with_explicit_pickup(monkeypatch):
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(
        svc._dispatch_tool(
            "start_booking",
            {
                "dest_name": "Banani",
                "dest_lat": 23.79,
                "dest_lng": 90.40,
                "pickup_name": "Gulshan",
                "pickup_lat": 23.78,
                "pickup_lng": 90.41,
            },
            DHAKA,
            loop_state,
        )
    )
    assert result["status"] == "booking_started"
    assert loop_state["booking"].pickup.name == "Gulshan"


def test_dispatch_start_booking_rejects_coordinates_outside_bangladesh():
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(
        svc._dispatch_tool(
            "start_booking",
            {"dest_name": "Somewhere", "dest_lat": BANGKOK.lat, "dest_lng": BANGKOK.lng},
            DHAKA,
            loop_state,
        )
    )
    assert "error" in result
    assert loop_state["booking"] is None


def test_dispatch_unknown_tool_returns_error():
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(svc._dispatch_tool("delete_all_rides", {}, DHAKA, loop_state))
    assert "error" in result


def test_dispatch_missing_required_args_returns_error_not_exception():
    loop_state = {"places": [], "booking": None}
    result = asyncio.run(svc._dispatch_tool("estimate_fare", {}, DHAKA, loop_state))
    assert "error" in result


# --- The tool-calling loop (run_agent) ---------------------------------------


def _fake_settings():
    return types.SimpleNamespace(groq_api_key="fake-key")


def _assistant_msg(content=None, tool_calls=None):
    return {"role": "assistant", "content": content, "tool_calls": tool_calls}


def _tool_call(call_id, name, arguments):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}


def test_run_agent_returns_direct_reply_with_no_tool_calls(monkeypatch):
    monkeypatch.setattr(svc, "get_settings", _fake_settings)

    async def fake_call_groq(messages):
        return _assistant_msg(content="Hello! How can I help?")

    monkeypatch.setattr(svc, "_call_groq", fake_call_groq)
    result = asyncio.run(svc.run_agent("hi", DHAKA, []))
    assert result["reply"] == "Hello! How can I help?"
    assert result["places"] == []
    assert result["booking"] is None


def test_run_agent_chains_search_then_booking(monkeypatch):
    monkeypatch.setattr(svc, "get_settings", _fake_settings)

    async def fake_resolve_places(query, near, limit=svc.RESULT_LIMIT):
        return [PlaceResult(name="Khwaja Yunus Ali University", address="Sirajganj", lat=24.05, lng=89.55, distance_km=85.0)]

    monkeypatch.setattr(svc, "resolve_places", fake_resolve_places)

    calls = {"n": 0}

    async def fake_call_groq(messages):
        calls["n"] += 1
        if calls["n"] == 1:
            return _assistant_msg(
                tool_calls=[_tool_call("c1", "search_places", {"query": "university"})]
            )
        if calls["n"] == 2:
            return _assistant_msg(
                tool_calls=[
                    _tool_call(
                        "c2",
                        "start_booking",
                        {
                            "dest_name": "Khwaja Yunus Ali University",
                            "dest_lat": 24.05,
                            "dest_lng": 89.55,
                        },
                    )
                ]
            )
        return _assistant_msg(content="Booking your ride to Khwaja Yunus Ali University.")

    monkeypatch.setattr(svc, "_call_groq", fake_call_groq)
    result = asyncio.run(svc.run_agent("book a ride to the nearest university", DHAKA, []))
    assert result["booking"].destination.name == "Khwaja Yunus Ali University"
    assert result["places"][0].name == "Khwaja Yunus Ali University"
    assert calls["n"] == 3


def test_run_agent_stops_at_max_rounds_and_falls_back(monkeypatch):
    monkeypatch.setattr(svc, "get_settings", _fake_settings)

    async def fake_resolve_places(query, near, limit=svc.RESULT_LIMIT):
        return [PlaceResult(name="Something", address=None, lat=23.8, lng=90.4, distance_km=1.0)]

    monkeypatch.setattr(svc, "resolve_places", fake_resolve_places)

    calls = {"n": 0}

    async def fake_call_groq(messages):
        # Never returns a final answer - always calls a tool again.
        calls["n"] += 1
        return _assistant_msg(tool_calls=[_tool_call(f"c{calls['n']}", "search_places", {"query": "loop"})])

    monkeypatch.setattr(svc, "_call_groq", fake_call_groq)
    result = asyncio.run(svc.run_agent("keep searching", DHAKA, []))
    assert calls["n"] == svc.MAX_TOOL_ROUNDS
    assert result["reply"]  # a fallback reply, not empty
    assert result["places"]  # whatever the last search surfaced


def test_run_agent_raises_when_groq_key_missing(monkeypatch):
    monkeypatch.setattr(svc, "get_settings", lambda: types.SimpleNamespace(groq_api_key=""))
    with pytest.raises(Exception):
        asyncio.run(svc.run_agent("hi", DHAKA, []))


def test_run_agent_passes_history_through(monkeypatch):
    monkeypatch.setattr(svc, "get_settings", _fake_settings)
    captured = {}

    async def fake_call_groq(messages):
        captured["messages"] = messages
        return _assistant_msg(content="ok")

    monkeypatch.setattr(svc, "_call_groq", fake_call_groq)
    history = [ChatMessage(role="user", content="earlier question")]
    asyncio.run(svc.run_agent("follow up", DHAKA, history))
    roles_and_content = [(m["role"], m["content"]) for m in captured["messages"]]
    assert ("user", "earlier question") in roles_and_content
    assert ("user", "follow up") in roles_and_content
