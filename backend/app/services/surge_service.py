from datetime import datetime, timedelta, timezone

from app.db.session import get_session_factory
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

    Uses prefix range scans on the stored geohash columns (plain lexicographic
    `>=`/`<=`, same trick as the old Firestore range query) so no extra index
    beyond the existing one on `geohash` is needed.
    """
    rules = rules or get_fare_rules()
    if not rules.get("surgeEnabled"):
        return 1.0

    # Local import - app.db.models would otherwise import back into this
    # module's package before it's fully initialized.
    from app.db.models import DriverProfile, RideRequest

    zone = geohash.encode(lat, lng, precision=ZONE_PRECISION)
    zone_end = zone + chr(0xF8FF)  # high sentinel: makes <= behave as prefix match
    cutoff = datetime.now(timezone.utc) - FRESH_LOCATION_WINDOW

    with get_session_factory()() as session:
        demand = (
            session.query(RideRequest)
            .filter(
                RideRequest.geohash >= zone,
                RideRequest.geohash <= zone_end,
                RideRequest.status == "pending",
            )
            .count()
        )
        supply = (
            session.query(DriverProfile)
            .filter(
                DriverProfile.geohash >= zone,
                DriverProfile.geohash <= zone_end,
                DriverProfile.online_status == "online",
                DriverProfile.location_updated_at >= cutoff,
            )
            .count()
        )

    if demand == 0:
        return 1.0

    ratio = demand / max(supply, 1)
    surge = 1.0 + SURGE_SLOPE * max(0.0, ratio - 1.0)
    surge = min(surge, rules.get("surgeCap", 2.5))

    # Step to 0.05 increments so estimates look intentional, not noisy.
    return round(round(surge * 20) / 20, 2)
