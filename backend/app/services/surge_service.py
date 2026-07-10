from datetime import datetime, timedelta, timezone

from app.core.firebase import get_firestore_client
from app.services import geohash
from app.services.fare_service import get_fare_rules

# A geohash prefix of length 5 is a ~4.9 x 4.9 km cell - a reasonable "zone"
# for city-scale demand/supply balancing.
ZONE_PRECISION = 5

# Drivers whose location heartbeat is older than this are not counted as supply.
FRESH_LOCATION_WINDOW = timedelta(minutes=2)

# How aggressively surge ramps: each unit of excess demand-per-driver
# above 1.0 adds 25% to the fare, up to the admin-configured cap.
SURGE_SLOPE = 0.25


def compute_surge(lat: float, lng: float, rules: dict | None = None) -> float:
    """Surge = f(open requests / available drivers) inside the pickup's zone.

    Uses prefix range scans on the stored geohash fields so no composite
    Firestore index is needed; status/freshness filtering happens in Python.
    """
    rules = rules or get_fare_rules()
    if not rules.get("surgeEnabled"):
        return 1.0

    db = get_firestore_client()
    zone = geohash.encode(lat, lng, precision=ZONE_PRECISION)
    zone_end = zone + chr(0xF8FF)  # high sentinel: makes <= behave as prefix match

    demand = sum(
        1
        for doc in db.collection("ride_requests")
        .where("geohash", ">=", zone)
        .where("geohash", "<=", zone_end)
        .stream()
        if doc.to_dict().get("status") == "pending"
    )

    cutoff = datetime.now(timezone.utc) - FRESH_LOCATION_WINDOW
    supply = 0
    for doc in (
        db.collection("driver_profiles")
        .where("currentLocation.geohash", ">=", zone)
        .where("currentLocation.geohash", "<=", zone_end)
        .stream()
    ):
        data = doc.to_dict()
        updated_at = (data.get("currentLocation") or {}).get("updatedAt")
        if data.get("onlineStatus") == "online" and updated_at and updated_at >= cutoff:
            supply += 1

    if demand == 0:
        return 1.0

    ratio = demand / max(supply, 1)
    surge = 1.0 + SURGE_SLOPE * max(0.0, ratio - 1.0)
    surge = min(surge, rules.get("surgeCap", 2.5))

    # Step to 0.05 increments so estimates look intentional, not noisy.
    return round(round(surge * 20) / 20, 2)
