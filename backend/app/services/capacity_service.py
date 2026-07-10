"""Pooled-ride capacity ledger - pure logic, no Firestore dependency, so it's
cheap to test exhaustively. Used by accept_ride to decide whether a driver's
vehicle has room left for one more rider/load on top of whatever they've
already committed to.
"""

ACTIVE_RIDE_STATUSES = ("accepted", "in_progress")


def committed_load(active_rides: list[dict]) -> tuple[float, float, int]:
    """Sum weight/volume/rider-count already committed across a driver's
    other active rides. Rides not in ACTIVE_RIDE_STATUSES don't count -
    e.g. a completed or cancelled ride no longer holds any capacity."""
    used_kg = used_m3 = 0.0
    riders = 0
    for ride in active_rides:
        if ride.get("status") not in ACTIVE_RIDE_STATUSES:
            continue
        goods = ride.get("goods") or {}
        used_kg += goods.get("weight_kg", 0) or 0
        used_m3 += goods.get("volume_m3", 0) or 0
        riders += 1
    return used_kg, used_m3, riders


def check_capacity(
    capacity: dict,
    active_rides: list[dict],
    incoming_goods: dict,
) -> tuple[bool, str | None]:
    """Would accepting a new ride with `incoming_goods` fit alongside the
    driver's other active rides, given their vehicle's `capacity`?

    Returns (True, None) if it fits, or (False, reason) if not - the reason
    is the exact message accept_ride surfaces to the driver.
    """
    used_kg, used_m3, riders = committed_load(active_rides)
    need_kg = incoming_goods.get("weight_kg", 0) or 0
    need_m3 = incoming_goods.get("volume_m3", 0) or 0

    if riders + 1 > capacity.get("maxPassengers", 1):
        return False, "No passenger seat left on your truck"
    if used_kg + need_kg > capacity.get("maxWeightKg", 0):
        return False, "Not enough weight capacity left for this load"
    if used_m3 + need_m3 > capacity.get("maxVolumeM3", 0):
        return False, "Not enough cargo space left for this load"
    return True, None
