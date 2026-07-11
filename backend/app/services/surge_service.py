"""Multi-factor surge engine.

The multiplier blends four independent demand-side signals, each one bounded
so no single input can run the price away, and each one failing soft to
"no contribution" when its data source is empty or unreachable:

  pressure  - live pending requests / fresh online drivers in the zone
              (the classic ratio; reacts to unmet demand happening right now)
  momentum  - zone demand in the last 15 min vs the 15 min before
              (reacts a few minutes AHEAD of pressure: a spike that drivers
              are still absorbing hasn't shown up as pending requests yet)
  baseline  - zone demand in the last 30 min vs the same clock window
              averaged over the past 4 weeks (is this busy FOR THIS ZONE
              at this time, not just busy in absolute numbers)
  rain      - live precipitation at the zone from Open-Meteo (free, no key);
              rain is one of the strongest real surge drivers in Dhaka

Time-of-day is deliberately NOT in here: peak-hour and night multipliers
already live in fare_service, so a component here would double-charge.

blend_surge() is pure math with no I/O so it can be tested exhaustively;
compute_surge() just gathers the inputs and delegates.
"""

import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import and_, or_

from app.db.session import get_session_factory
from app.services import geohash
from app.services.fare_service import get_fare_rules

# A geohash prefix of length 5 is a ~4.9 x 4.9 km cell - a reasonable "zone"
# for city-scale demand/supply balancing.
ZONE_PRECISION = 5

# Drivers whose location heartbeat is older than this are not counted as supply.
FRESH_LOCATION_WINDOW = timedelta(minutes=2)

# Component weights. Pressure is the dominant signal (unbounded before the
# admin cap - genuinely unmet demand should be able to hit the cap alone);
# the other three are advisory and each clamped to a small maximum bump.
PRESSURE_SLOPE = 0.25   # +25% per unit of excess demand-per-driver
MOMENTUM_SLOPE = 0.10   # up to +20% when demand is accelerating
MOMENTUM_EXCESS_CAP = 2.0
BASELINE_SLOPE = 0.10   # up to +20% when busier than this zone's normal
BASELINE_EXCESS_CAP = 2.0
RAIN_SLOPE = 0.15       # up to +15% in heavy rain
RAIN_SATURATION_MM = 8.0  # >= this much rain (mm, current hour) = full bump

MOMENTUM_WINDOW = timedelta(minutes=15)
BASELINE_WINDOW = timedelta(minutes=30)
BASELINE_LOOKBACK_WEEKS = 4
# Below this many expected rides per window the zone's history is too thin
# to call anything "unusual" - skip the component (cold-start guard).
BASELINE_MIN_EXPECTED = 0.5

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Weather changes slowly and Open-Meteo is a free public service - cache per
# zone for 10 minutes, and cache failures too so an outage can't add latency
# to every estimate. Baseline history barely moves within a window - 15 min.
_WEATHER_TTL_SECONDS = 600
_weather_cache: dict[str, tuple[float, float]] = {}
_BASELINE_TTL_SECONDS = 900
_baseline_cache: dict[str, tuple[float, float]] = {}


def blend_surge(
    pressure_ratio: float,
    momentum_ratio: float,
    baseline_ratio: float,
    rain_mm: float,
    cap: float,
) -> float:
    """Pure formula: ratios of 1.0 (or below) contribute nothing; only the
    excess above 1.0 raises the price. Result is clamped to [1.0, cap] and
    stepped to 0.05 increments so estimates look intentional, not noisy."""
    surge = 1.0
    surge += PRESSURE_SLOPE * max(0.0, pressure_ratio - 1.0)
    surge += MOMENTUM_SLOPE * min(max(0.0, momentum_ratio - 1.0), MOMENTUM_EXCESS_CAP)
    surge += BASELINE_SLOPE * min(max(0.0, baseline_ratio - 1.0), BASELINE_EXCESS_CAP)
    surge += RAIN_SLOPE * min(max(rain_mm, 0.0) / RAIN_SATURATION_MM, 1.0)
    surge = min(surge, cap)
    return round(round(surge * 20) / 20, 2)


def _count_zone_rides(session, bbox, windows: list[tuple[datetime, datetime]]) -> int:
    """Rides *requested* inside the zone box during any of the windows.
    Uses the persistent rides table (ride_requests rows are deleted once
    accepted/expired, so they can't provide history)."""
    from app.db.models import Ride

    lat_min, lat_max, lng_min, lng_max = bbox
    return (
        session.query(Ride)
        .filter(
            Ride.pickup_lat >= lat_min,
            Ride.pickup_lat < lat_max,
            Ride.pickup_lng >= lng_min,
            Ride.pickup_lng < lng_max,
            or_(*[
                and_(Ride.requested_at >= start, Ride.requested_at < end)
                for start, end in windows
            ]),
        )
        .count()
    )


def _expected_baseline(session, zone: str, bbox, now: datetime) -> float:
    """Average rides per BASELINE_WINDOW in this zone at this clock time,
    over the past BASELINE_LOOKBACK_WEEKS. Cached - history barely moves
    within a window and this is the most expensive of the queries."""
    cached = _baseline_cache.get(zone)
    if cached and time.monotonic() - cached[1] < _BASELINE_TTL_SECONDS:
        return cached[0]

    windows = []
    for week in range(1, BASELINE_LOOKBACK_WEEKS + 1):
        start = now - timedelta(weeks=week)
        windows.append((start - BASELINE_WINDOW, start))
    total = _count_zone_rides(session, bbox, windows)
    expected = total / BASELINE_LOOKBACK_WEEKS

    _baseline_cache[zone] = (expected, time.monotonic())
    return expected


def _current_rain_mm(zone: str, lat: float, lng: float) -> float:
    """Live precipitation (mm) at the zone from Open-Meteo. Any failure is
    cached as 0.0 - weather must never break or slow down fare estimates."""
    cached = _weather_cache.get(zone)
    if cached and time.monotonic() - cached[1] < _WEATHER_TTL_SECONDS:
        return cached[0]

    rain = 0.0
    try:
        response = httpx.get(
            OPEN_METEO_URL,
            params={"latitude": lat, "longitude": lng, "current": "precipitation"},
            timeout=2.5,
        )
        if response.status_code == 200:
            rain = float(response.json().get("current", {}).get("precipitation") or 0.0)
    except (httpx.HTTPError, ValueError, TypeError):
        pass

    _weather_cache[zone] = (rain, time.monotonic())
    return rain


def compute_surge(lat: float, lng: float, rules: dict | None = None) -> float:
    """Blend the four zone signals into one bounded multiplier.

    Zone membership uses prefix range scans on the stored geohash columns
    for the live tables, and the cell's lat/lng bounding box (geohash.bounds)
    for the rides history table, which stores raw coordinates.
    """
    rules = rules or get_fare_rules()
    if not rules.get("surgeEnabled"):
        return 1.0

    # Local import - app.db.models would otherwise import back into this
    # module's package before it's fully initialized.
    from app.db.models import DriverProfile, RideRequest

    zone = geohash.encode(lat, lng, precision=ZONE_PRECISION)
    zone_end = zone + chr(0xF8FF)  # high sentinel: makes <= behave as prefix match
    bbox = geohash.bounds(zone)
    now = datetime.now(timezone.utc)
    cutoff = now - FRESH_LOCATION_WINDOW

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

        recent = _count_zone_rides(session, bbox, [(now - MOMENTUM_WINDOW, now)])
        previous = _count_zone_rides(
            session, bbox, [(now - 2 * MOMENTUM_WINDOW, now - MOMENTUM_WINDOW)]
        )
        expected = _expected_baseline(session, zone, bbox, now)

    pressure_ratio = demand / max(supply, 1) if demand else 0.0
    momentum_ratio = recent / max(previous, 1) if recent else 0.0
    baseline_ratio = (
        (recent + previous) / expected if expected >= BASELINE_MIN_EXPECTED else 0.0
    )
    rain_mm = _current_rain_mm(zone, lat, lng)

    return blend_surge(
        pressure_ratio,
        momentum_ratio,
        baseline_ratio,
        rain_mm,
        rules.get("surgeCap", 2.5),
    )
