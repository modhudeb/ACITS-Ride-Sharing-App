import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.models.ride import LatLng

logger = logging.getLogger(__name__)

DIRECTIONS_API_URL = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{coords}"


async def compute_route(origin: LatLng, destination: LatLng) -> dict:
    settings = get_settings()

    if not settings.mapbox_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Maps service is not configured (MAPBOX_TOKEN missing)",
        )

    coords = f"{origin.lng},{origin.lat};{destination.lng},{destination.lat}"
    url = DIRECTIONS_API_URL.format(coords=coords)
    params = {
        "access_token": settings.mapbox_token,
        "geometries": "geojson",
        # "simplified" keeps the line visually identical at city zoom levels
        # while returning far fewer points than "full" - shrinks every ride
        # doc and every listener snapshot that carries route_path.
        "overview": "simplified",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)

    if response.status_code != 200:
        # Don't pass the provider's raw response back to the client - it can
        # include request internals (query params, occasionally account/plan
        # details) that are none of the caller's business. Full detail still
        # goes to the server log for debugging.
        logger.warning(
            "Mapbox directions request failed (%s): %s",
            response.status_code,
            response.text[:500],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Route lookup failed - please try again",
        )

    data = response.json()
    routes = data.get("routes") or []
    if not routes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No driving route found between these points",
        )

    route = routes[0]
    coordinates = route.get("geometry", {}).get("coordinates", [])

    return {
        "distance_meters": round(route.get("distance", 0)),
        "duration_seconds": round(route.get("duration", 0)),
        "route_path": [{"lat": lat, "lng": lng} for lng, lat in coordinates],
    }
