from app.services.geohash import bounds, encode
from app.services.surge_service import (
    BASELINE_EXCESS_CAP,
    BASELINE_SLOPE,
    MOMENTUM_EXCESS_CAP,
    MOMENTUM_SLOPE,
    PRESSURE_SLOPE,
    RAIN_SATURATION_MM,
    RAIN_SLOPE,
    blend_surge,
)


def test_quiet_zone_is_flat():
    assert blend_surge(0.0, 0.0, 0.0, 0.0, cap=2.5) == 1.0


def test_ratios_at_one_contribute_nothing():
    # Demand exactly matched by supply/history is normal, not surge-worthy.
    assert blend_surge(1.0, 1.0, 1.0, 0.0, cap=2.5) == 1.0


def test_pressure_matches_legacy_formula():
    # Pressure alone must reproduce the original engine: 1 + 0.25*(ratio-1).
    assert blend_surge(3.0, 0.0, 0.0, 0.0, cap=2.5) == 1.5
    assert blend_surge(2.0, 0.0, 0.0, 0.0, cap=2.5) == 1.25


def test_momentum_is_clamped():
    uncapped = blend_surge(0.0, 100.0, 0.0, 0.0, cap=5.0)
    assert uncapped == round(1.0 + MOMENTUM_SLOPE * MOMENTUM_EXCESS_CAP, 2)


def test_baseline_is_clamped():
    uncapped = blend_surge(0.0, 0.0, 100.0, 0.0, cap=5.0)
    assert uncapped == round(1.0 + BASELINE_SLOPE * BASELINE_EXCESS_CAP, 2)


def test_rain_saturates():
    light = blend_surge(0.0, 0.0, 0.0, RAIN_SATURATION_MM / 2, cap=2.5)
    heavy = blend_surge(0.0, 0.0, 0.0, RAIN_SATURATION_MM, cap=2.5)
    monsoon = blend_surge(0.0, 0.0, 0.0, RAIN_SATURATION_MM * 10, cap=2.5)
    assert light < heavy
    assert heavy == monsoon == round(1.0 + RAIN_SLOPE, 2)


def test_negative_rain_is_ignored():
    assert blend_surge(0.0, 0.0, 0.0, -3.0, cap=2.5) == 1.0


def test_admin_cap_always_wins():
    assert blend_surge(50.0, 100.0, 100.0, 99.0, cap=2.5) == 2.5
    assert blend_surge(50.0, 100.0, 100.0, 99.0, cap=1.8) == 1.8


def test_components_stack():
    # pressure 2.0 (+0.25), momentum 2.0 (+0.10), baseline 2.0 (+0.10),
    # full rain (+0.15) = 1.60
    assert blend_surge(2.0, 2.0, 2.0, RAIN_SATURATION_MM, cap=2.5) == 1.6


def test_result_steps_in_05_increments():
    value = blend_surge(1.3, 0.0, 0.0, 0.0, cap=2.5)
    assert round(value * 20) == value * 20


def test_pressure_alone_can_reach_cap():
    # The dominant signal must be able to hit the cap without help.
    assert blend_surge(10.0, 0.0, 0.0, 0.0, cap=2.5) == 2.5


def test_bounds_contains_encoded_point():
    lat, lng = 23.8103, 90.4125
    cell = encode(lat, lng, precision=5)
    lat_min, lat_max, lng_min, lng_max = bounds(cell)
    assert lat_min <= lat <= lat_max
    assert lng_min <= lng <= lng_max


def test_bounds_cell_size_at_precision_5():
    # A 5-char cell is ~4.9 x 4.9 km: about 0.044 degrees both ways here.
    lat_min, lat_max, lng_min, lng_max = bounds("wh0r3")
    assert 0.02 < (lat_max - lat_min) < 0.06
    assert 0.02 < (lng_max - lng_min) < 0.06


def test_bounds_of_adjacent_cells_do_not_overlap():
    a = bounds("wh0r3")
    b = bounds("wh0r4")
    overlap_lat = min(a[1], b[1]) - max(a[0], b[0])
    overlap_lng = min(a[3], b[3]) - max(a[2], b[2])
    # Cells may share an edge but never area.
    assert overlap_lat <= 0 or overlap_lng <= 0
