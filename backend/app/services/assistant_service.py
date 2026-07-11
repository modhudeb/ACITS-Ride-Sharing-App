import asyncio
import json
import math
import time

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.models.assistant import AssistantBooking, ChatMessage, PlaceResult
from app.models.ride import LatLng
from app.services import fare_service, maps_service, surge_service

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
# llama-3.3-70b-versatile's tool-calling gets unreliable under a longer
# system prompt (it drifts into emitting raw "<function=name>{args}</function>"
# text instead of a structured tool_calls entry, which Groq's API then
# rejects outright as a 400) - llama-4-scout is natively tool-use trained and
# stayed correct across every case tested, including the same long prompt.
GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
PHOTON_SEARCH_URL = "https://photon.komoot.io/api/"
PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse"
CATEGORY_SEARCH_URL = "https://api.mapbox.com/search/searchbox/v1/category/{category}"
FORWARD_SEARCH_URL = "https://api.mapbox.com/search/searchbox/v1/forward"

# Results are deliberately unrestricted by distance WITHIN Bangladesh:
# proximity is only a ranking bias so nearer matches sort first, but the
# service only operates in BD, so anything outside the country is noise
# and every lookup (Photon filter + Mapbox country param) enforces that.
COUNTRY_CODE = "BD"
RESULT_LIMIT = 10
# Tried in order for category (Overpass) search - most requests are answered
# by the tight 12km radius, but a genuinely rural "nearest university" needs
# room to find the closest one even if it's a town over, so a second, wider
# pass runs before giving up and falling back to Mapbox.
OVERPASS_RADII_METERS = (12000, 40000)
# Rough Bangladesh bounding box - used only as a sanity check on coordinates
# a tool call claims to book/estimate against, so the model can't walk a
# booking off to an invented location outside the country.
BD_BOUNDS = {"lat_min": 20.5, "lat_max": 26.7, "lng_min": 88.0, "lng_max": 92.8}

# Every tag filter is ANDed. A category maps to one or more OSM key=value
# pairs rather than a single pair, since some real distinctions (a mosque vs
# a temple) only exist as amenity=place_of_worship plus a religion tag.
CATEGORY_TO_OSM_TAGS: dict[str, dict[str, str]] = {
    # Food & drink
    "restaurant": {"amenity": "restaurant"},
    "cafe": {"amenity": "cafe"},
    "fast_food": {"amenity": "fast_food"},
    "bar": {"amenity": "bar"},
    "bakery": {"shop": "bakery"},
    "sweets_shop": {"shop": "confectionery"},
    "tea_stall": {"shop": "tea"},
    # Lodging
    "hotel": {"tourism": "hotel"},
    "guest_house": {"tourism": "guest_house"},
    # Health
    "pharmacy": {"amenity": "pharmacy"},
    "hospital": {"amenity": "hospital"},
    "clinic": {"amenity": "clinic"},
    "dentist": {"amenity": "dentist"},
    "veterinary": {"amenity": "veterinary"},
    # Education
    "school": {"amenity": "school"},
    "college": {"amenity": "college"},
    "university": {"amenity": "university"},
    "library": {"amenity": "library"},
    "coaching_center": {"amenity": "language_school"},
    # Worship
    "mosque": {"amenity": "place_of_worship", "religion": "muslim"},
    "temple": {"amenity": "place_of_worship", "religion": "hindu"},
    "church": {"amenity": "place_of_worship", "religion": "christian"},
    # Finance
    "bank": {"amenity": "bank"},
    "atm": {"amenity": "atm"},
    # Shopping
    "supermarket": {"shop": "supermarket"},
    "grocery_store": {"shop": "convenience"},
    "shopping_mall": {"shop": "mall"},
    "market": {"amenity": "marketplace"},
    "clothes_store": {"shop": "clothes"},
    "electronics_store": {"shop": "electronics"},
    "hardware_store": {"shop": "hardware"},
    "bookstore": {"shop": "books"},
    "jewellery_store": {"shop": "jewelry"},
    "mobile_shop": {"shop": "mobile_phone"},
    # Transport
    "airport": {"aeroway": "aerodrome"},
    "train_station": {"railway": "station"},
    "bus_station": {"amenity": "bus_station"},
    "ferry_terminal": {"amenity": "ferry_terminal"},
    "gas_station": {"amenity": "fuel"},
    # Government & services
    "police": {"amenity": "police"},
    "post_office": {"amenity": "post_office"},
    "fire_station": {"amenity": "fire_station"},
    "government_office": {"office": "government"},
    "laundry": {"shop": "laundry"},
    "car_repair": {"shop": "car_repair"},
    # Leisure & culture
    "park": {"leisure": "park"},
    "gym": {"leisure": "fitness_centre"},
    "stadium": {"leisure": "stadium"},
    "cinema": {"amenity": "cinema"},
    "museum": {"tourism": "museum"},
    "community_center": {"amenity": "community_centre"},
    "wedding_hall": {"amenity": "events_venue"},
}
KNOWN_CATEGORIES = set(CATEGORY_TO_OSM_TAGS)

MAX_TOOL_ROUNDS = 4

# The model has real tools for everything factual - it never answers "where
# is X" or "what's my location" from its own knowledge, since it would
# happily invent a place or address that doesn't exist. Every coordinate the
# model ever uses in a reply or a booking must come from a tool result.
AGENT_SYSTEM_PROMPT = (
    """You are the ride-hailing app's chat assistant for a passenger in Bangladesh.

You have tools to search real places, look up the passenger's current address,
estimate fares, and start a ride booking. ALWAYS use these tools instead of
guessing - never invent a place's name, address, or coordinates yourself.

Guidelines:
- To find a place (by category like "nearest hospital" or by exact name like
  "Khwaja Yunus Ali University"), call search_places. It searches all of
  Bangladesh, not just nearby - if the closest match is far away, that's
  fine, just tell the passenger the distance honestly.
- Known category ids for search_places: """
    + ", ".join(sorted(KNOWN_CATEGORIES))
    + """. For a specific named place, pass the name as the passenger wrote it instead.
- If asked about the passenger's own location or address, call
  reverse_geocode_passenger - never guess this either.
- If asked "how much" or "how far" to a place, first call search_places (skip
  this if you already have its coordinates from earlier in this chat), then
  call estimate_fare.
- If the passenger asks to book/take a ride somewhere (e.g. "book a ride to
  X", "take me to X", "I want to go to X"), that request IS their
  confirmation - first call search_places for the destination (unless you
  already have it from earlier in this chat), pick the best single match
  (usually the nearest, unless the passenger's wording points at a different
  one), and immediately call start_booking with its coordinates in the SAME
  turn. Do not ask "would you like to book this?" first - they already told
  you to. If they also named a different starting point, search_places for
  that too and pass it as the pickup.
- Only pause to ask a clarifying question before booking when the results
  are genuinely ambiguous - e.g. several similarly-named places and nothing
  in the request suggests which one, or the request was just "find X" with
  no booking intent at all (then list options instead of booking).
- For ordinary chat with no place, booking, or fare involved, just reply
  normally without calling any tool.
- Keep replies short and friendly, in the same language the passenger used
  (English or Bangla).
"""
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_places",
            "description": (
                "Search for real places in Bangladesh near the passenger. Pass "
                "either a known category id for a KIND of place, or a specific "
                "place/business name as typed by the user. Returns real, "
                "indexed results with coordinates - always call this before "
                "start_booking or estimate_fare unless you already have "
                "coordinates for that place from earlier in this conversation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A category id, or a place/business name",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reverse_geocode_passenger",
            "description": (
                "Get the human-readable address/area name of the passenger's "
                "current GPS location. Use for questions like 'what is my "
                "location', 'where am I', 'what's my pickup address'."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "estimate_fare",
            "description": (
                "Estimate ride distance, duration and fare (BDT) to a "
                "destination. Destination coordinates MUST come from a "
                "previous search_places result. If pickup_lat/pickup_lng are "
                "omitted, the passenger's current location is used as pickup."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dest_lat": {"type": ["number", "string"]},
                    "dest_lng": {"type": ["number", "string"]},
                    "pickup_lat": {"type": ["number", "string"]},
                    "pickup_lng": {"type": ["number", "string"]},
                },
                "required": ["dest_lat", "dest_lng"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_booking",
            "description": (
                "Start booking a ride for the passenger to a destination. Only "
                "call this once the passenger clearly wants to book a ride to a "
                "specific place you already found via search_places. "
                "Destination coordinates and name MUST come from a previous "
                "search_places result - never invent coordinates. Only pass "
                "pickup fields if the passenger named an explicit starting "
                "point different from their current location (also from a "
                "previous search_places result); otherwise the app uses their "
                "live GPS location as pickup."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dest_name": {"type": "string"},
                    "dest_address": {"type": "string"},
                    "dest_lat": {"type": ["number", "string"]},
                    "dest_lng": {"type": ["number", "string"]},
                    "pickup_name": {"type": "string"},
                    "pickup_address": {"type": "string"},
                    "pickup_lat": {"type": ["number", "string"]},
                    "pickup_lng": {"type": ["number", "string"]},
                },
                "required": ["dest_name", "dest_lat", "dest_lng"],
            },
        },
    },
]


def _haversine_km(a: LatLng | dict, b: LatLng | dict) -> float:
    lat1 = a.lat if hasattr(a, "lat") else a["lat"]
    lng1 = a.lng if hasattr(a, "lng") else a["lng"]
    lat2 = b.lat if hasattr(b, "lat") else b["lat"]
    lng2 = b.lng if hasattr(b, "lng") else b["lng"]

    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a_ = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a_), math.sqrt(1 - a_))


def _in_bangladesh(lat: float, lng: float) -> bool:
    return (
        BD_BOUNDS["lat_min"] <= lat <= BD_BOUNDS["lat_max"]
        and BD_BOUNDS["lng_min"] <= lng <= BD_BOUNDS["lng_max"]
    )


async def _query_overpass(
    tags: dict[str, str], near: LatLng, limit: int, radius_meters: int
) -> list[PlaceResult] | None:
    """Returns None (signal to fall back) on any failure, [] on a genuine
    empty result. One retry per radius, since the public instance
    occasionally 504s under load.

    Queries `nwr` (node + way + relation), not just `node` - a lot of real
    places (university campuses, hospital grounds, malls) are mapped in OSM
    as polygons, not point nodes, and would otherwise never match."""
    tag_filter = "".join(f'["{k}"="{v}"]' for k, v in tags.items())
    query = (
        f"[out:json][timeout:15];"
        f"(nwr{tag_filter}(around:{radius_meters},{near.lat},{near.lng}););"
        f"out center {limit};"
    )

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(
                timeout=17.0, headers={"User-Agent": "RideShareApp/1.0 (portfolio project)"}
            ) as client:
                response = await client.post(OVERPASS_URL, data={"data": query})
            if response.status_code == 200:
                break
        except httpx.HTTPError:
            pass
        if attempt == 0:
            await asyncio.sleep(1.5)
    else:
        return None

    elements = response.json().get("elements", [])
    results = []
    for el in elements:
        lat, lng = el.get("lat"), el.get("lon")
        if lat is None or lng is None:
            # Ways/relations don't carry lat/lon directly - `out center`
            # attaches a computed centroid under "center" instead.
            center = el.get("center") or {}
            lat, lng = center.get("lat"), center.get("lon")
        if lat is None or lng is None:
            continue
        name = el.get("tags", {}).get("name")
        if not name:
            continue
        results.append(
            PlaceResult(
                name=name,
                address=el.get("tags", {}).get("addr:full"),
                lat=lat,
                lng=lng,
                distance_km=round(_haversine_km(near, {"lat": lat, "lng": lng}), 1),
            )
        )

    results.sort(key=lambda p: p.distance_km)
    return results


async def _query_category(tags: dict[str, str], near: LatLng, limit: int) -> list[PlaceResult]:
    """Tries each radius in OVERPASS_RADII_METERS until something is found.
    Stops immediately (returns []) on a hard failure rather than retrying
    at every radius against a service that's already down."""
    for radius in OVERPASS_RADII_METERS:
        results = await _query_overpass(tags, near, limit, radius)
        if results is None:
            return []
        if results:
            return results
    return []


async def _query_photon(search_query: str, near: LatLng, limit: int) -> list[PlaceResult] | None:
    """Named-place search on OpenStreetMap data via the free Photon geocoder,
    same source the booking screen's search box uses. Returns None on any
    failure (signal to fall back to Mapbox), [] on a genuine empty result."""
    params = {
        "q": search_query,
        "limit": limit,
        "lang": "en",
        "lat": near.lat,
        "lon": near.lng,
    }
    try:
        async with httpx.AsyncClient(
            timeout=10.0, headers={"User-Agent": "RideShareApp/1.0 (portfolio project)"}
        ) as client:
            response = await client.get(PHOTON_SEARCH_URL, params=params)
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None

    results = []
    for feature in response.json().get("features", []):
        props = feature.get("properties", {})
        # Strict equality: a result missing countrycode entirely must not
        # slip through as if it were inside Bangladesh.
        if (props.get("countrycode") or "").upper() != COUNTRY_CODE:
            continue
        coords = feature.get("geometry", {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lng, lat = coords[0], coords[1]
        name = props.get("name")
        if not name:
            continue
        address_parts = [props.get("street"), props.get("district"), props.get("city"), props.get("state")]
        address = ", ".join(dict.fromkeys(p for p in address_parts if p)) or None
        results.append(
            PlaceResult(
                name=name,
                address=address,
                lat=lat,
                lng=lng,
                distance_km=round(_haversine_km(near, {"lat": lat, "lng": lng}), 1),
            )
        )

    results.sort(key=lambda p: p.distance_km)
    return results


async def _query_mapbox(search_query: str, near: LatLng, limit: int, *, is_category: bool) -> list[PlaceResult]:
    settings = get_settings()
    if not settings.mapbox_token:
        return []

    url = (
        CATEGORY_SEARCH_URL.format(category=search_query.lower())
        if is_category
        else FORWARD_SEARCH_URL
    )
    params = {
        "access_token": settings.mapbox_token,
        "proximity": f"{near.lng},{near.lat}",
        "limit": limit,
        "country": COUNTRY_CODE,
    }
    if not is_category:
        params["q"] = search_query

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)

    if response.status_code != 200:
        return []

    features = response.json().get("features", [])
    results = []
    for feature in features:
        lng, lat = feature["geometry"]["coordinates"]
        props = feature.get("properties", {})
        distance_km = round(_haversine_km(near, {"lat": lat, "lng": lng}), 1)
        results.append(
            PlaceResult(
                name=props.get("name", "Unknown place"),
                address=props.get("full_address") or props.get("place_formatted"),
                lat=lat,
                lng=lng,
                distance_km=distance_km,
            )
        )

    results.sort(key=lambda p: p.distance_km)
    return results


# Common wrapping the model uses around a bare category id ("nearest
# university", "pharmacy near me", "any hospital around") - the tool-calling
# model isn't reliably constrained to emit the exact category id on its own,
# so this normalization matters more than it did with the old forced-JSON
# response format.
_CATEGORY_QUERY_PREFIXES = ("nearest ", "closest ", "the nearest ", "the closest ", "any ", "an ", "a ")
_CATEGORY_QUERY_SUFFIXES = (" near me", " nearby", " around me", " around here", " close to me", " close by", " around")


def _normalize_category_query(text: str) -> str:
    normalized = text.lower().strip()
    for suffix in _CATEGORY_QUERY_SUFFIXES:
        if normalized.endswith(suffix):
            normalized = normalized[: -len(suffix)]
            break
    for prefix in _CATEGORY_QUERY_PREFIXES:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    normalized = normalized.strip()
    if normalized in CATEGORY_TO_OSM_TAGS:
        return normalized

    # The model says "universities"/"pharmacies"/"hospitals" about as often
    # as the singular category id - without this, a plural silently falls
    # through to named-place search instead of the category search, which
    # then returns nonsense (Photon matching businesses with "universities"
    # literally in their name instead of actual university-tagged places).
    if normalized.endswith("ies") and f"{normalized[:-3]}y" in CATEGORY_TO_OSM_TAGS:
        return f"{normalized[:-3]}y"
    if normalized.endswith("es") and normalized[:-2] in CATEGORY_TO_OSM_TAGS:
        return normalized[:-2]
    if normalized.endswith("s") and normalized[:-1] in CATEGORY_TO_OSM_TAGS:
        return normalized[:-1]
    return normalized


async def resolve_places(search_query: str, near: LatLng, limit: int = RESULT_LIMIT) -> list[PlaceResult]:
    key = _normalize_category_query(search_query)
    osm_tags = CATEGORY_TO_OSM_TAGS.get(key)

    if osm_tags:
        results = await _query_category(osm_tags, near, limit)
        if results:
            return results
        # Overpass unreachable OR nothing within any tried radius - fall back
        # to Mapbox's category search (country-restricted to BD), so the user
        # always gets whatever exists rather than an empty answer.
        return await _query_mapbox(key, near, limit, is_category=True)

    # Named places: OSM (Photon) first - denser Bangladesh coverage and the
    # same source as the booking screen's search box - then Mapbox (also
    # country-restricted) when Photon is down or finds nothing in BD.
    results = await _query_photon(search_query, near, limit)
    if results:
        return results
    return await _query_mapbox(search_query, near, limit, is_category=False)


# Weather-style small cache: an address for a given spot doesn't change, and
# this avoids a reverse-geocode round trip on every message in a chat where
# the passenger asks a few things in a row from the same spot.
_REVERSE_CACHE_TTL_SECONDS = 120
_reverse_cache: dict[tuple[float, float], tuple[str | None, float]] = {}


async def reverse_geocode(lat: float, lng: float) -> str | None:
    key = (round(lat, 3), round(lng, 3))
    cached = _reverse_cache.get(key)
    if cached and time.monotonic() - cached[1] < _REVERSE_CACHE_TTL_SECONDS:
        return cached[0]

    address = None
    try:
        async with httpx.AsyncClient(
            timeout=8.0, headers={"User-Agent": "RideShareApp/1.0 (portfolio project)"}
        ) as client:
            response = await client.get(
                PHOTON_REVERSE_URL, params={"lon": lng, "lat": lat, "lang": "en"}
            )
        if response.status_code == 200:
            features = response.json().get("features", [])
            if features:
                props = features[0].get("properties", {})
                parts = [
                    props.get("name"),
                    props.get("street"),
                    props.get("district") or props.get("city"),
                    props.get("state"),
                ]
                address = ", ".join(dict.fromkeys(p for p in parts if p)) or None
    except httpx.HTTPError:
        pass

    _reverse_cache[key] = (address, time.monotonic())
    return address


async def _dispatch_tool(name: str, args: dict, near: LatLng, loop_state: dict) -> dict:
    try:
        if name == "search_places":
            query = (args.get("query") or "").strip()
            if not query:
                return {"error": "query is required"}
            results = await resolve_places(query, near)
            loop_state["places"] = results
            return {
                "count": len(results),
                "results": [
                    {
                        "index": i + 1,
                        "name": r.name,
                        "address": r.address,
                        "lat": r.lat,
                        "lng": r.lng,
                        "distance_km": r.distance_km,
                    }
                    for i, r in enumerate(results)
                ],
            }

        if name == "reverse_geocode_passenger":
            address = await reverse_geocode(near.lat, near.lng)
            return {"address": address or "Unknown location"}

        if name == "estimate_fare":
            dest_lat, dest_lng = float(args["dest_lat"]), float(args["dest_lng"])
            if not _in_bangladesh(dest_lat, dest_lng):
                return {"error": "Destination coordinates must come from a previous search_places result"}
            destination = LatLng(lat=dest_lat, lng=dest_lng)

            if args.get("pickup_lat") is not None and args.get("pickup_lng") is not None:
                pickup_lat, pickup_lng = float(args["pickup_lat"]), float(args["pickup_lng"])
                if not _in_bangladesh(pickup_lat, pickup_lng):
                    return {"error": "Pickup coordinates must come from a previous search_places result"}
                origin = LatLng(lat=pickup_lat, lng=pickup_lng)
            else:
                origin = near

            route = await maps_service.compute_route(origin, destination)
            rules = fare_service.get_fare_rules()
            surge = surge_service.compute_surge(origin.lat, origin.lng, rules=rules)
            fare = fare_service.calculate_fare(
                route["distance_meters"],
                route["duration_seconds"],
                surge_multiplier=surge,
                rules=rules,
            )
            return {
                "distance_km": round(route["distance_meters"] / 1000, 1),
                "duration_min": round(route["duration_seconds"] / 60),
                "fare_bdt": fare["total"],
                "surge_multiplier": surge,
            }

        if name == "start_booking":
            dest_lat, dest_lng = float(args["dest_lat"]), float(args["dest_lng"])
            if not _in_bangladesh(dest_lat, dest_lng):
                return {"error": "Destination coordinates must come from a previous search_places result - search first"}
            destination = PlaceResult(
                name=args.get("dest_name") or "Destination",
                address=args.get("dest_address"),
                lat=dest_lat,
                lng=dest_lng,
                distance_km=round(_haversine_km(near, {"lat": dest_lat, "lng": dest_lng}), 1),
            )

            pickup = None
            if args.get("pickup_lat") is not None and args.get("pickup_lng") is not None:
                pickup_lat, pickup_lng = float(args["pickup_lat"]), float(args["pickup_lng"])
                if not _in_bangladesh(pickup_lat, pickup_lng):
                    return {"error": "Pickup coordinates must come from a previous search_places result"}
                pickup = PlaceResult(
                    name=args.get("pickup_name") or "Pickup",
                    address=args.get("pickup_address"),
                    lat=pickup_lat,
                    lng=pickup_lng,
                    distance_km=0.0,
                )

            loop_state["booking"] = AssistantBooking(destination=destination, pickup=pickup)
            return {"status": "booking_started", "destination": destination.name}

        return {"error": f"Unknown tool '{name}'"}
    except (KeyError, TypeError, ValueError) as exc:
        return {"error": f"Invalid arguments: {exc}"}


async def _call_groq(messages: list[dict]) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": 0.2,
                "tools": TOOLS,
                "tool_choice": "auto",
            },
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Assistant lookup failed: {response.text}",
        )
    return response.json()["choices"][0]["message"]


async def run_agent(message: str, location: LatLng, history: list[ChatMessage]) -> dict:
    """Bounded tool-calling loop: the model decides which tools to call (if
    any), sees their real results, and can chain calls (e.g. search then
    book) before giving a final text reply. Capped at MAX_TOOL_ROUNDS so a
    confused model can't loop forever - if it's still calling tools at the
    cap, whatever the tools already surfaced is returned instead of nothing.
    """
    settings = get_settings()
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat assistant is not configured (GROQ_API_KEY missing)",
        )

    messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    loop_state: dict = {"places": [], "booking": None}
    reply_text = None

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            assistant_message = await _call_groq(messages)
        except HTTPException:
            # The provider rejected this round's generation outright (seen in
            # practice: a stray malformed tool call, or a schema mismatch on
            # an otherwise-valid attempt). Whatever real results the tools
            # already surfaced earlier this turn are still good - stop and
            # let the fallback below build a reply from them, rather than
            # failing the whole request over one bad generation.
            break
        tool_calls = assistant_message.get("tool_calls") or []
        if not tool_calls:
            reply_text = (assistant_message.get("content") or "").strip()
            break

        messages.append(assistant_message)
        for call in tool_calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            result = await _dispatch_tool(name, args, location, loop_state)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id", ""),
                    "content": json.dumps(result, default=str),
                }
            )

    if not reply_text:
        if loop_state["booking"]:
            reply_text = f"Booking a ride to {loop_state['booking'].destination.name}..."
        elif loop_state["places"]:
            reply_text = "Here's what I found:"
        else:
            reply_text = "Sorry, I couldn't work that out - could you rephrase?"

    return {
        "reply": reply_text,
        "places": loop_state["places"],
        "booking": loop_state["booking"],
    }
