from datetime import datetime

from app.services.fare_service import calculate_fare

# Fixed rules so tests never touch Firestore.
RULES = {
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

OFF_PEAK = datetime(2026, 7, 7, 12, 0)  # noon: not peak, not night
PEAK = datetime(2026, 7, 7, 8, 0)
NIGHT = datetime(2026, 7, 7, 23, 30)
NIGHT_WRAP = datetime(2026, 7, 7, 3, 0)  # after midnight, still night


def fare(**kwargs):
    defaults = dict(
        distance_meters=8000,
        duration_seconds=22 * 60,
        at=OFF_PEAK,
        rules=RULES,
    )
    defaults.update(kwargs)
    return calculate_fare(**defaults)


def test_basic_metered_fare():
    result = fare()
    # metered = (40 + 8*15 + 22*2) = 204, pool discount 20% -> 163.2, + booking 20
    assert result["base_fare"] == 40.0
    assert result["distance_fare"] == 120.0
    assert result["time_fare"] == 44.0
    assert result["pool_discount_pct"] == 20.0
    assert result["total"] == round(204 * 0.8 + 20, 2)
    assert not result["minimum_fare_applied"]


def test_minimum_fare_floor():
    result = fare(distance_meters=300, duration_seconds=60)
    # metered = (40 + 4.5 + 2) * 0.8 = 37.2 < 80 -> floor applies
    assert result["minimum_fare_applied"]
    assert result["total"] == 80.0 + 20.0


def test_goods_surcharge_not_discounted_or_surged():
    plain = fare()
    loaded = fare(goods_weight_kg=100, goods_volume_m3=2)
    # surcharge = 100*0.5 + 2*30 = 110, added after discount, before booking fee
    assert loaded["goods_surcharge"] == 110.0
    assert loaded["total"] == round(plain["total"] + 110.0, 2)

    surged = fare(goods_weight_kg=100, goods_volume_m3=2, surge_multiplier=2.0)
    assert surged["goods_surcharge"] == 110.0  # unchanged by surge


def test_surge_multiplies_metered_only():
    plain = fare()
    surged = fare(surge_multiplier=2.0)
    metered_plain = plain["total"] - RULES["bookingFee"]
    metered_surged = surged["total"] - RULES["bookingFee"]
    assert metered_surged == round(metered_plain * 2.0, 2)


def test_surge_capped():
    capped = fare(surge_multiplier=10.0)
    at_cap = fare(surge_multiplier=RULES["surgeCap"])
    assert capped["surge_multiplier"] == RULES["surgeCap"]
    assert capped["total"] == at_cap["total"]


def test_surge_ignored_when_disabled():
    rules = {**RULES, "surgeEnabled": False}
    result = fare(surge_multiplier=2.0, rules=rules)
    assert result["surge_multiplier"] == 1.0


def test_peak_hour_multiplier():
    peak = fare(at=PEAK)
    assert peak["peak_hour_multiplier"] == 1.2
    assert peak["night_multiplier"] == 1.0


def test_night_window_wraps_midnight():
    late = fare(at=NIGHT)
    early = fare(at=NIGHT_WRAP)
    noon = fare(at=OFF_PEAK)
    assert late["night_multiplier"] == 1.15
    assert early["night_multiplier"] == 1.15
    assert noon["night_multiplier"] == 1.0


def test_booking_fee_always_flat():
    for kwargs in [{}, {"surge_multiplier": 2.5}, {"at": PEAK}, {"goods_weight_kg": 500}]:
        assert fare(**kwargs)["booking_fee"] == 20.0
