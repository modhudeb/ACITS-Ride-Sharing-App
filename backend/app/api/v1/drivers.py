from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.rate_limit import rate_limit
from app.core.realtime import manager
from app.core.security import CurrentUser, get_current_user, require_role
from app.db.models import DriverProfile, Ride
from app.db.session import get_db
from app.models.user import (
    DriverLocationRequest,
    DriverOnlineStatusRequest,
    EarningsSummary,
    VehicleOut,
    VehicleSetupRequest,
)
from app.services import geohash

router = APIRouter(prefix="/drivers", tags=["drivers"])


def _profile_payload(profile: DriverProfile) -> dict:
    """Full driver_profile state - pushed on driver_profile:{uid} whenever
    vehicle/capacity/status/rating changes."""
    return {
        "uid": profile.uid,
        "vehicle_type": profile.vehicle_type,
        "vehicle_model": profile.vehicle_model,
        "plate_number": profile.plate_number,
        "max_passengers": profile.max_passengers,
        "max_weight_kg": profile.max_weight_kg,
        "max_volume_m3": profile.max_volume_m3,
        "online_status": profile.online_status,
        "rating_avg": profile.rating_avg,
        "rating_count": profile.rating_count,
        # Last-known location, so a fresh page load (or useDriverLocation's
        # initial fetch) has something to show before the next heartbeat's
        # driver_locations push arrives.
        "lat": profile.current_lat,
        "lng": profile.current_lng,
        "location_updated_at": (
            profile.location_updated_at.isoformat() if profile.location_updated_at else None
        ),
    }


def _location_payload(profile: DriverProfile) -> dict:
    """Smaller, high-frequency payload pushed on driver_locations - covers
    LiveOps' map, useAvailableDrivers, and useDriverLocation."""
    return {
        "uid": profile.uid,
        "lat": profile.current_lat,
        "lng": profile.current_lng,
        "online_status": profile.online_status,
        "vehicle_type": profile.vehicle_type,
        "updated_at": profile.location_updated_at.isoformat() if profile.location_updated_at else None,
    }


@router.get("/locations")
def list_online_driver_locations(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every online driver's last-known location - the initial snapshot for
    useAvailableDrivers/LiveOps before the driver_locations topic starts
    pushing individual updates. Any signed-in user may read this (matches
    the old Firestore rule on driver_profiles)."""
    profiles = db.query(DriverProfile).filter(DriverProfile.online_status == "online").all()
    return [_location_payload(p) for p in profiles]


@router.get("/{uid}/profile")
def get_driver_profile(
    uid: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Any signed-in user may look up a driver's profile (matches the old
    Firestore rule on driver_profiles) - used both for a driver's own
    DriverHome screen and a passenger looking up their assigned driver."""
    profile = db.get(DriverProfile, uid)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver profile not found")
    return _profile_payload(profile)


@router.post("/vehicle", response_model=VehicleOut)
def set_vehicle_details(
    payload: VehicleSetupRequest,
    current_user: CurrentUser = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    # Only trucks pool cargo - bikes/cars get zero cargo capacity so the
    # existing accept-ride weight/volume check naturally keeps goods-carrying
    # requests off them without any extra branching there.
    is_truck = payload.vehicle_type == "truck"
    max_weight_kg = payload.max_weight_kg if is_truck else 0
    max_volume_m3 = payload.max_volume_m3 if is_truck else 0

    profile = db.get(DriverProfile, current_user.uid)
    if not profile:
        profile = DriverProfile(uid=current_user.uid)
        db.add(profile)

    profile.vehicle_type = payload.vehicle_type
    profile.vehicle_model = payload.vehicle_model
    profile.plate_number = payload.plate_number
    profile.max_passengers = payload.max_passengers
    profile.max_weight_kg = max_weight_kg
    profile.max_volume_m3 = max_volume_m3

    db.commit()
    manager.broadcast(
        f"driver_profile:{current_user.uid}",
        {"topic": f"driver_profile:{current_user.uid}", "type": "state", "data": _profile_payload(profile)},
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
    db: Session = Depends(get_db),
):
    profile = db.get(DriverProfile, current_user.uid)

    if payload.status == "online" and (not profile or profile.max_passengers is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set up your vehicle details before going online",
        )

    if not profile:
        profile = DriverProfile(uid=current_user.uid)
        db.add(profile)

    profile.online_status = payload.status
    db.commit()

    manager.broadcast(
        f"driver_profile:{current_user.uid}",
        {"topic": f"driver_profile:{current_user.uid}", "type": "state", "data": _profile_payload(profile)},
    )
    manager.broadcast(
        "driver_locations", {"topic": "driver_locations", "type": "state", "data": _location_payload(profile)}
    )
    manager.broadcast("admin_ops", {"topic": "admin_ops", "type": "signal"})
    return {"status": payload.status}


@router.post("/location")
def update_driver_location(
    payload: DriverLocationRequest,
    current_user: CurrentUser = Depends(require_role("driver")),
    _: CurrentUser = Depends(rate_limit("drivers.location", max_calls=6, window_seconds=10)),
    db: Session = Depends(get_db),
):
    profile = db.get(DriverProfile, current_user.uid)
    if not profile:
        profile = DriverProfile(uid=current_user.uid)
        db.add(profile)

    profile.current_lat = payload.lat
    profile.current_lng = payload.lng
    profile.geohash = geohash.encode(payload.lat, payload.lng)
    profile.location_updated_at = datetime.now(timezone.utc)
    db.commit()

    manager.broadcast(
        "driver_locations", {"topic": "driver_locations", "type": "state", "data": _location_payload(profile)}
    )
    return {"ok": True}


@router.get("/heatmap")
def get_demand_heatmap(
    current_user: CurrentUser = Depends(require_role("driver")),
    _: CurrentUser = Depends(rate_limit("drivers.heatmap", max_calls=10, window_seconds=60)),
    db: Session = Depends(get_db),
):
    """Pickup points from the last 30 days - drivers use this to position
    themselves where requests usually appear."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rides = db.query(Ride.pickup_lat, Ride.pickup_lng).filter(Ride.requested_at >= cutoff).all()
    return {"points": [{"lat": lat, "lng": lng} for lat, lng in rides]}


@router.get("/earnings", response_model=EarningsSummary)
def get_driver_earnings(
    current_user: CurrentUser = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    # complete_ride always writes final_fare when a ride completes, so the
    # fare_estimate fallback only matters for rows from before that was true.
    fare_expr = func.coalesce(Ride.final_fare, Ride.fare_estimate, 0)
    base_query = db.query(func.count(Ride.id), func.coalesce(func.sum(fare_expr), 0)).filter(
        Ride.driver_id == current_user.uid, Ride.status == "completed"
    )

    all_time_rides, all_time_total = base_query.one()
    week_rides, week_total = base_query.filter(Ride.completed_at >= week_start).one()
    today_rides, today_total = base_query.filter(Ride.completed_at >= today_start).one()

    return EarningsSummary(
        today_total=round(float(today_total), 2),
        week_total=round(float(week_total), 2),
        all_time_total=round(float(all_time_total), 2),
        today_rides=today_rides,
        week_rides=week_rides,
        all_time_rides=all_time_rides,
    )
