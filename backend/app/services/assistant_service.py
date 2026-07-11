import asyncio
import json
import math

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.models.assistant import ChatMessage, PlaceResult
from app.models.ride import LatLng

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
CATEGORY_SEARCH_URL = "https://api.mapbox.com/search/searchbox/v1/category/{category}"
FORWARD_SEARCH_URL = "https://api.mapbox.com/search/searchbox/v1/forward"

# Results are deliberately unrestricted by distance: proximity is passed to
# Mapbox only as a ranking bias so nearer matches sort first, but a match
# anywhere is still returned - the user picks from the list, so showing a
# far-away result is strictly better than pretending it doesn't exist.
RESULT_LIMIT = 10
OVERPASS_RADIUS_METERS = 12000

# Mapbox's commercial POI dataset (dataplor) has thin coverage in Bangladesh -
# the nearest "restaurant" it knows about near central Dhaka is ~80km away,
# in India. OpenStreetMap's community-mapped data is far denser here, so
# category lookups go to Overpass first and fall back to Mapbox when it's
# unreachable or has no local matches. Named-business search (e.g. "Square
# company") stays on Mapbox since Overpass free-text name search is too slow
# for a chat response (single-instance regex scan can take 20-30s).
CATEGORY_TO_OSM_TAG = {
    "restaurant": ("amenity", "restaurant"),
    "cafe": ("amenity", "cafe"),
    "fast_food": ("amenity", "fast_food"),
    "bar": ("amenity", "bar"),
    "hotel": ("tourism", "hotel"),
    "pharmacy": ("amenity", "pharmacy"),
    "hospital": ("amenity", "hospital"),
    "bank": ("amenity", "bank"),
    "atm": ("amenity", "atm"),
    "supermarket": ("shop", "supermarket"),
    "gas_station": ("amenity", "fuel"),
    "shopping_mall": ("shop", "mall"),
    "airport": ("aeroway", "aerodrome"),
    "train_station": ("railway", "station"),
    "bus_station": ("amenity", "bus_station"),
    "school": ("amenity", "school"),
    "park": ("leisure", "park"),
    "gym": ("leisure", "fitness_centre"),
    "grocery_store": ("shop", "convenience"),
}
KNOWN_CATEGORIES = set(CATEGORY_TO_OSM_TAG)

# The model only ever does intent parsing - it never answers "where is X"
# itself, since it would happily invent addresses that don't exist. Real
# coordinates always come from Mapbox's Search Box API in resolve_places().
SYSTEM_PROMPT = """You are the ride-hailing app's chat assistant. The user may:
- ask to find a place, nearby or anywhere (e.g. "nearest restaurant", "where is Square company", "any pharmacy around")
- just chat about their trip

Respond with ONLY a JSON object, no other text, in this exact shape:
{"intent": "place_search" or "chat", "search_query": "<term, or null>", "reply": "<brief friendly reply>"}

If intent is "place_search" and the user is asking for a KIND of place, set
search_query to one of these exact category ids: """ + ", ".join(sorted(KNOWN_CATEGORIES)) + """.
If the user is asking for a specific named place or business (e.g. "Square company",
"KFC Gulshan"), set search_query to that name as written instead.
Keep "reply" short; if it's a place_search, say you're looking, e.g. "Here's what I found:".
"""


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


async def parse_intent(message: str, history: list[ChatMessage]) -> dict:
    settings = get_settings()
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat assistant is not configured (GROQ_API_KEY missing)",
        )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    async with httpx.AsyncClient(timeout=15.0) as client:
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
                "response_format": {"type": "json_object"},
            },
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Assistant lookup failed: {response.text}",
        )

    content = response.json()["choices"][0]["message"]["content"]
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {"intent": "chat", "search_query": None, "reply": content.strip()[:500]}

    return {
        "intent": parsed.get("intent", "chat"),
        "search_query": parsed.get("search_query"),
        "reply": parsed.get("reply", "").strip() or "Here's what I found:",
    }


async def _query_overpass(osm_key: str, osm_value: str, near: LatLng, limit: int) -> list[PlaceResult] | None:
    """Returns None (signal to fall back) on any failure, [] on a genuine
    empty result. One retry, since the public instance occasionally 504s
    under load."""
    query = (
        f'[out:json][timeout:10];'
        f'(node["{osm_key}"="{osm_value}"](around:{OVERPASS_RADIUS_METERS},{near.lat},{near.lng}););'
        f"out center {limit};"
    )

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(
                timeout=12.0, headers={"User-Agent": "RideShareApp/1.0 (portfolio project)"}
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


async def resolve_places(search_query: str, near: LatLng, limit: int = RESULT_LIMIT) -> list[PlaceResult]:
    key = search_query.lower()
    osm_tag = CATEGORY_TO_OSM_TAG.get(key)

    if osm_tag:
        results = await _query_overpass(*osm_tag, near, limit)
        if results:
            return results
        # Overpass unreachable OR nothing within its local radius - fall back
        # to Mapbox's category search, which has no distance restriction, so
        # the user always gets whatever exists rather than an empty answer.
        return await _query_mapbox(key, near, limit, is_category=True)

    return await _query_mapbox(search_query, near, limit, is_category=False)
