import pytest

from app.services.capacity_service import check_capacity, committed_load

TRUCK_CAPACITY = {"maxWeightKg": 500, "maxVolumeM3": 3.0, "maxPassengers": 2}
BIKE_CAPACITY = {"maxWeightKg": 0, "maxVolumeM3": 0, "maxPassengers": 1}


def ride(status="accepted", weight_kg=0, volume_m3=0):
    return {"status": status, "goods": {"weight_kg": weight_kg, "volume_m3": volume_m3}}


def test_committed_load_sums_only_active_rides():
    active_rides = [
        ride("accepted", weight_kg=50, volume_m3=0.5),
        ride("in_progress", weight_kg=30, volume_m3=0.2),
        ride("completed", weight_kg=1000, volume_m3=10),  # must not count
        ride("cancelled", weight_kg=1000, volume_m3=10),  # must not count
    ]
    used_kg, used_m3, riders = committed_load(active_rides)
    assert used_kg == 80
    assert used_m3 == pytest.approx(0.7)
    assert riders == 2


def test_fits_when_under_every_limit():
    fits, reason = check_capacity(TRUCK_CAPACITY, [], {"weight_kg": 100, "volume_m3": 1.0})
    assert fits is True
    assert reason is None


def test_rejects_when_no_passenger_seat_left():
    active_rides = [ride(), ride()]  # 2 riders already, capacity is 2
    fits, reason = check_capacity(TRUCK_CAPACITY, active_rides, {"weight_kg": 0, "volume_m3": 0})
    assert fits is False
    assert "seat" in reason.lower()


def test_rejects_when_weight_exceeds_capacity():
    fits, reason = check_capacity(TRUCK_CAPACITY, [], {"weight_kg": 501, "volume_m3": 0})
    assert fits is False
    assert "weight" in reason.lower()


def test_rejects_when_volume_exceeds_capacity():
    fits, reason = check_capacity(TRUCK_CAPACITY, [], {"weight_kg": 0, "volume_m3": 3.1})
    assert fits is False
    assert "cargo space" in reason.lower()


def test_weight_check_accounts_for_already_committed_load():
    active_rides = [ride(weight_kg=450)]
    fits, reason = check_capacity(TRUCK_CAPACITY, active_rides, {"weight_kg": 60, "volume_m3": 0})
    assert fits is False
    assert "weight" in reason.lower()


def test_bike_and_car_have_zero_cargo_capacity_by_design():
    # set_vehicle_details zeroes weight/volume for non-truck vehicles, so any
    # goods-carrying request should always be rejected for them.
    fits, reason = check_capacity(BIKE_CAPACITY, [], {"weight_kg": 1, "volume_m3": 0})
    assert fits is False

    fits, reason = check_capacity(BIKE_CAPACITY, [], {"weight_kg": 0, "volume_m3": 0.1})
    assert fits is False


def test_bike_still_accepts_a_plain_passenger_ride():
    fits, reason = check_capacity(BIKE_CAPACITY, [], {"weight_kg": 0, "volume_m3": 0})
    assert fits is True
    assert reason is None


def test_second_bike_ride_rejected_single_seat():
    active_rides = [ride()]
    fits, reason = check_capacity(BIKE_CAPACITY, active_rides, {"weight_kg": 0, "volume_m3": 0})
    assert fits is False
    assert "seat" in reason.lower()


def test_missing_goods_fields_treated_as_zero():
    fits, reason = check_capacity(TRUCK_CAPACITY, [], {})
    assert fits is True
