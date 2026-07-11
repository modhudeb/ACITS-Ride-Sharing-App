import time
from datetime import datetime
from zoneinfo import ZoneInfo

from app.db.session import get_session_factory

# Peak/night windows are defined in local Dhaka time - the server itself may
# run on UTC (most hosts do), so "now" must be converted, not taken as-is.
FARE_TIMEZONE = ZoneInfo("Asia/Dhaka")

# Pricing model follows the Uber/Pathao structure:
#   metered = (base + km*perKm + min*perMin) * peak * night * surge
#   metered *= (1 - poolDiscount)          -- pooled truck rides are discounted
#   goods   = kg*perKg + m3*perM3          -- handling fee, never surged
#   fare    = max(metered + goods, minimumFare) + bookingFee
# The booking fee is added after everything and is never multiplied by surge
# (matching how Uber treats it). Amounts are BDT.
DEFAULT_FARE_RULES = {
    "baseFare": 40.0,
    "perKmRate": 15.0,
    "perMinRate": 2.0,
    "bookingFee": 20.0,
    "minimumFare": 80.0,
    "perKgRate": 0.5,
    "perM3Rate": 30.0,
    "poolDiscountPct": 20.0,
    "peakHourMultiplier": 1.2,
    "nightMultiplier": 1.15,
    "surgeEnabled": True,
    "surgeCap": 2.5,
    "cancellationFee": 30.0,
    "cancellationFreeWindowSec": 120,
    "peakHours": [[7, 10], [17, 20]],
    "nightHours": [22, 6],
}


# Every estimate, booking, and surge computation needs the fare rules, but
# they only actually change when an admin saves the pricing page - reading the
# config doc from Firestore on each call paid one read per estimate for a
# value that's identical 99.9% of the time. A short TTL keeps multi-worker
# deployments (which can't see this process's invalidation) at most a minute
# stale, and update_pricing invalidates immediately for the local process.
_RULES_CACHE_TTL_SECONDS = 60
_rules_cache: dict | None = None
_rules_cached_at: float = 0.0


def _row_to_dict(row) -> dict:
    return {
        "baseFare": row.base_fare,
        "perKmRate": row.per_km_rate,
        "perMinRate": row.per_min_rate,
        "bookingFee": row.booking_fee,
        "minimumFare": row.minimum_fare,
        "perKgRate": row.per_kg_rate,
        "perM3Rate": row.per_m3_rate,
        "poolDiscountPct": row.pool_discount_pct,
        "peakHourMultiplier": row.peak_hour_multiplier,
        "nightMultiplier": row.night_multiplier,
        "surgeEnabled": row.surge_enabled,
        "surgeCap": row.surge_cap,
        "cancellationFee": row.cancellation_fee,
        "cancellationFreeWindowSec": row.cancellation_free_window_sec,
        "peakHours": row.peak_hours,
        "nightHours": row.night_hours,
    }


def get_fare_rules() -> dict:
    global _rules_cache, _rules_cached_at
    if (
        _rules_cache is not None
        and time.monotonic() - _rules_cached_at < _RULES_CACHE_TTL_SECONDS
    ):
        return dict(_rules_cache)

    # Local import - app.db.models would otherwise import back into this
    # module's package before it's fully initialized.
    from app.db.models import FareRules as FareRulesRow

    with get_session_factory()() as session:
        row = session.get(FareRulesRow, 1)
        rules = {**DEFAULT_FARE_RULES, **_row_to_dict(row)} if row else dict(DEFAULT_FARE_RULES)

    _rules_cache = rules
    _rules_cached_at = time.monotonic()
    # Copies keep a caller that mutates its result from poisoning the cache.
    return dict(rules)


def save_fare_rules(db, payload) -> None:
    """Upserts the singleton fare_rules row from the admin pricing form and
    invalidates the in-process cache so the very next estimate sees it."""
    from app.db.models import FareRules as FareRulesRow

    row = db.get(FareRulesRow, 1)
    if not row:
        row = FareRulesRow(id=1)
        db.add(row)

    row.base_fare = payload.base_fare
    row.per_km_rate = payload.per_km_rate
    row.per_min_rate = payload.per_min_rate
    row.booking_fee = payload.booking_fee
    row.minimum_fare = payload.minimum_fare
    row.per_kg_rate = payload.per_kg_rate
    row.per_m3_rate = payload.per_m3_rate
    row.pool_discount_pct = payload.pool_discount_pct
    row.peak_hour_multiplier = payload.peak_hour_multiplier
    row.night_multiplier = payload.night_multiplier
    row.surge_enabled = payload.surge_enabled
    row.surge_cap = payload.surge_cap
    row.cancellation_fee = payload.cancellation_fee
    row.cancellation_free_window_sec = payload.cancellation_free_window_sec
    # The admin pricing form doesn't edit peak/night windows - keep whatever
    # is already stored, defaulting to DEFAULT_FARE_RULES for a brand new row.
    row.peak_hours = row.peak_hours or DEFAULT_FARE_RULES["peakHours"]
    row.night_hours = row.night_hours or DEFAULT_FARE_RULES["nightHours"]

    db.commit()
    invalidate_fare_rules_cache()


def invalidate_fare_rules_cache() -> None:
    global _rules_cache
    _rules_cache = None


def _is_in_peak_window(hour: int, rules: dict) -> bool:
    return any(start <= hour < end for start, end in rules["peakHours"])


def _is_in_night_window(hour: int, rules: dict) -> bool:
    start, end = rules["nightHours"]
    if start > end:
        return hour >= start or hour < end
    return start <= hour < end


def calculate_fare(
    distance_meters: float,
    duration_seconds: float,
    goods_weight_kg: float = 0,
    goods_volume_m3: float = 0,
    surge_multiplier: float = 1.0,
    at: datetime | None = None,
    rules: dict | None = None,
) -> dict:
    rules = rules or get_fare_rules()
    at = at or datetime.now(FARE_TIMEZONE)

    distance_km = distance_meters / 1000
    duration_min = duration_seconds / 60

    base_fare = rules["baseFare"]
    distance_fare = distance_km * rules["perKmRate"]
    time_fare = duration_min * rules["perMinRate"]

    peak_multiplier = rules["peakHourMultiplier"] if _is_in_peak_window(at.hour, rules) else 1.0
    night_multiplier = rules["nightMultiplier"] if _is_in_night_window(at.hour, rules) else 1.0
    surge = min(max(surge_multiplier, 1.0), rules["surgeCap"]) if rules.get("surgeEnabled") else 1.0
    pool_discount_pct = rules.get("poolDiscountPct", 0)

    metered = (base_fare + distance_fare + time_fare) * peak_multiplier * night_multiplier * surge
    metered *= 1 - pool_discount_pct / 100

    goods_surcharge = goods_weight_kg * rules["perKgRate"] + goods_volume_m3 * rules["perM3Rate"]

    subtotal = metered + goods_surcharge
    minimum_fare_applied = subtotal < rules["minimumFare"]
    total = max(subtotal, rules["minimumFare"]) + rules["bookingFee"]

    return {
        "base_fare": round(base_fare, 2),
        "distance_fare": round(distance_fare, 2),
        "time_fare": round(time_fare, 2),
        "goods_surcharge": round(goods_surcharge, 2),
        "booking_fee": round(rules["bookingFee"], 2),
        "peak_hour_multiplier": peak_multiplier,
        "night_multiplier": night_multiplier,
        "surge_multiplier": surge,
        "pool_discount_pct": pool_discount_pct,
        "minimum_fare_applied": minimum_fare_applied,
        "total": round(total, 2),
    }
