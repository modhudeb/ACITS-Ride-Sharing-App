from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from firebase_admin import firestore

from app.core.firebase import get_firestore_client
from app.core.rate_limit import rate_limit
from app.core.security import CurrentUser, require_role
from fastapi import HTTPException, status

from app.models.user import (
    DriverLocationRequest,
    DriverOnlineStatusRequest,
    EarningsSummary,
    VehicleOut,
    VehicleSetupRequest,
)
from app.services import geohash

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.post("/vehicle", response_model=VehicleOut)
def set_vehicle_details(
    payload: VehicleSetupRequest,
    current_user: CurrentUser = Depends(require_role("driver")),
):
    # Only trucks pool cargo - bikes/cars get zero cargo capacity so the
    # existing accept-ride weight/volume check naturally keeps goods-carrying
    # requests off them without any extra branching there.
    is_truck = payload.vehicle_type == "truck"
    max_weight_kg = payload.max_weight_kg if is_truck else 0
    max_volume_m3 = payload.max_volume_m3 if is_truck else 0

    db = get_firestore_client()
    db.collection("driver_profiles").document(current_user.uid).set(
        {
            "vehicle": {
                "type": payload.vehicle_type,
                "model": payload.vehicle_model,
                "plate": payload.plate_number,
            },
            "capacity": {
                "maxWeightKg": max_weight_kg,
                "maxVolumeM3": max_volume_m3,
                "maxPassengers": payload.max_passengers,
            },
        },
        merge=True,
    )
    return VehicleOut(
        vehicle_type=payload.vehicle_type,
        vehicle_model=payload.vehicle_model,
        plate_number=payload.plate_number,
        max_passengers=payload.max_passengers,
        max_weight_kg=max_weight_kg if is_truck else None,
        max_volume_m3=max_volume_m3 if is_truck else None,
    )


@router.post("/status")
def set_driver_status(
    payload: DriverOnlineStatusRequest,
    current_user: CurrentUser = Depends(require_role("driver")),
):
    db = get_firestore_client()
    profile_ref = db.collection("driver_profiles").document(current_user.uid)

    if payload.status == "online":
        profile = profile_ref.get()
        if not profile.exists or not profile.to_dict().get("capacity"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Set up your vehicle details before going online",
            )

    profile_ref.set({"onlineStatus": payload.status}, merge=True)
    return {"status": payload.status}


@router.post("/location")
def update_driver_location(
    payload: DriverLocationRequest,
    current_user: CurrentUser = Depends(require_role("driver")),
    _: CurrentUser = Depends(rate_limit("drivers.location", max_calls=6, window_seconds=10)),
):
    db = get_firestore_client()
    db.collection("driver_profiles").document(current_user.uid).set(
        {
            "currentLocation": {
                "lat": payload.lat,
                "lng": payload.lng,
                "geohash": geohash.encode(payload.lat, payload.lng),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        },
        merge=True,
    )
    return {"ok": True}


@router.get("/heatmap")
def get_demand_heatmap(
    current_user: CurrentUser = Depends(require_role("driver")),
    _: CurrentUser = Depends(rate_limit("drivers.heatmap", max_calls=10, window_seconds=60)),
):
    """Pickup points from the last 30 days - drivers use this to position
    themselves where requests usually appear."""
    db = get_firestore_client()
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    # Date-bounded at the query level (single-field range, no composite
    # index needed) instead of streaming - and paying to read - the entire
    # rides collection, most of which is older than the 30-day window this
    # endpoint actually cares about. The rate limit above stops a driver
    # toggling the heatmap repeatedly from re-paying for that scan each time.
    points = []
    for doc in db.collection("rides").where("requestedAt", ">=", cutoff).stream():
        data = doc.to_dict()
        pickup = data.get("pickup") or {}
        if pickup.get("lat") is None:
            continue
        points.append({"lat": pickup["lat"], "lng": pickup["lng"]})

    return {"points": points}


@router.get("/earnings", response_model=EarningsSummary)
def get_driver_earnings(current_user: CurrentUser = Depends(require_role("driver"))):
    db = get_firestore_client()
    query = (
        db.collection("rides")
        .where("driverId", "==", current_user.uid)
        .where("status", "==", "completed")
    )

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    today_total = week_total = all_time_total = 0.0
    today_rides = week_rides = all_time_rides = 0

    for doc in query.stream():
        data = doc.to_dict()
        fare = data.get("finalFare") or data.get("fareEstimate") or 0
        completed_at = data.get("completedAt")

        all_time_total += fare
        all_time_rides += 1

        if completed_at:
            if completed_at >= week_start:
                week_total += fare
                week_rides += 1
            if completed_at >= today_start:
                today_total += fare
                today_rides += 1

    return EarningsSummary(
        today_total=round(today_total, 2),
        week_total=round(week_total, 2),
        all_time_total=round(all_time_total, 2),
        today_rides=today_rides,
        week_rides=week_rides,
        all_time_rides=all_time_rides,
    )
