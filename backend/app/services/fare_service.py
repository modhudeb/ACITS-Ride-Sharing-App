from datetime import datetime

from app.core.firebase import get_firestore_client

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


def get_fare_rules() -> dict:
    doc = get_firestore_client().collection("fare_rules").document("config").get()
    if doc.exists:
        return {**DEFAULT_FARE_RULES, **doc.to_dict()}
    return dict(DEFAULT_FARE_RULES)


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
    at = at or datetime.now()

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
