import time
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.firebase import get_firestore_client

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


def get_fare_rules() -> dict:
    global _rules_cache, _rules_cached_at
    if (
        _rules_cache is not None
        and time.monotonic() - _rules_cached_at < _RULES_CACHE_TTL_SECONDS
    ):
        return dict(_rules_cache)

    doc = get_firestore_client().collection("fare_rules").document("config").get()
    rules = {**DEFAULT_FARE_RULES, **doc.to_dict()} if doc.exists else dict(DEFAULT_FARE_RULES)
    _rules_cache = rules
    _rules_cached_at = time.monotonic()
    # Copies keep a caller that mutates its result from poisoning the cache.
    return dict(rules)


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
