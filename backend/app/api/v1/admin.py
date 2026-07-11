import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import rate_limit_by_ip
from app.core.realtime import manager
from app.core.security import CurrentUser, create_access_token, require_role
from app.db.models import DriverProfile, Ride, User
from app.db.session import get_db
from app.models.admin import AdminLoginRequest, DashboardStats, FareRules
from app.models.auth import AuthResponse, AuthUser
from app.models.ride import RideOut
from app.models.user import DriverOut, DriverStatusUpdate, UserOut, UserStatusUpdate
from app.services import fare_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AuthResponse)
def admin_login(
    payload: AdminLoginRequest,
    _: None = Depends(rate_limit_by_ip("admin.login", max_calls=10, window_seconds=60)),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    # Constant-time compare for the password half - plain != short-circuits
    # on the first differing character, which is a (minor, but free to
    # close) timing side channel. Username isn't a secret, so a normal
    # comparison there is fine.
    valid = payload.username == settings.admin_username and secrets.compare_digest(
        payload.password, settings.admin_password
    )
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin username or password",
        )

    # The admin account's credential check is against ADMIN_USERNAME/
    # ADMIN_PASSWORD above, never a stored password_hash - this row exists
    # purely so the admin has a normal users/{uid} identity elsewhere in the
    # app (ratings, broadcasts, etc.).
    email = f"{settings.admin_username}@acits.internal"
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            uid=str(uuid.uuid4()),
            role="admin",
            name="Administrator",
            email=email,
            status="active",
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()

    token = create_access_token(user.uid, "admin", user.email)
    return AuthResponse(
        token=token,
        user=AuthUser(uid=user.uid, name=user.name, email=user.email, role="admin", status=user.status),
    )


@router.get("/drivers", response_model=list[DriverOut])
def list_drivers(
    driver_status: str | None = None,
    admin: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.role == "driver")
    if driver_status:
        query = query.filter(User.status == driver_status)
    users = query.limit(500).all()
    return [DriverOut(uid=u.uid, name=u.name, email=u.email, status=u.status) for u in users]


@router.patch("/drivers/{uid}", response_model=DriverOut)
def update_driver_status(
    uid: str,
    payload: DriverStatusUpdate,
    admin: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    user = db.get(User, uid)
    if not user or user.role != "driver":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    user.status = payload.status
    db.commit()

    # Lets that driver's own AuthProvider (subscribed to user:{uid}) pick up
    # an approval/suspension the moment it happens, instead of only on their
    # next sign-in.
    manager.broadcast(
        f"user:{uid}",
        {
            "topic": f"user:{uid}",
            "type": "state",
            "data": {"role": user.role, "name": user.name, "status": user.status},
        },
    )
    return DriverOut(uid=uid, name=user.name, email=user.email, status=payload.status)


@router.get("/passengers", response_model=list[UserOut])
def list_passengers(admin: CurrentUser = Depends(require_role("admin")), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.role == "passenger").limit(500).all()
    return [
        UserOut(uid=u.uid, name=u.name, email=u.email, role="passenger", status=u.status) for u in users
    ]


@router.patch("/passengers/{uid}", response_model=UserOut)
def update_passenger_status(
    uid: str,
    payload: UserStatusUpdate,
    admin: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    user = db.get(User, uid)
    if not user or user.role != "passenger":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passenger not found")

    user.status = payload.status
    db.commit()

    manager.broadcast(
        f"user:{uid}",
        {
            "topic": f"user:{uid}",
            "type": "state",
            "data": {"role": user.role, "name": user.name, "status": user.status},
        },
    )
    return UserOut(uid=uid, name=user.name, email=user.email, role="passenger", status=payload.status)


@router.get("/rides")
def list_rides(
    ride_status: str | None = None,
    limit: int = 100,
    admin: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    capped_limit = max(1, min(limit, 500))

    query = db.query(Ride).order_by(Ride.requested_at.desc())
    if ride_status:
        query = query.filter(Ride.status == ride_status)
    rides = query.limit(capped_limit).all()

    return [
        {
            "id": r.id,
            "passenger_name": r.passenger_name,
            "driver_name": r.driver_name,
            "status": r.status,
            "pickup_address": r.pickup_address,
            "destination_address": r.destination_address,
            "distance_meters": r.distance_meters,
            "fare_estimate": r.fare_estimate,
            "final_fare": r.final_fare,
            "goods": {"weight_kg": r.goods_weight_kg, "volume_m3": r.goods_volume_m3},
            "cancellation_fee": r.cancellation_fee,
            "cancel_reason": r.cancel_reason,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
        }
        for r in rides
    ]


@router.get("/rides/active", response_model=list[RideOut])
def list_active_rides(
    admin: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Full ride state (including pickup/destination coordinates) for
    everything currently accepted or in progress - LiveOps' map needs actual
    coordinates, unlike the address-only list above."""
    from app.api.v1.rides import _ride_to_out

    rides = db.query(Ride).filter(Ride.status.in_(["accepted", "in_progress"])).all()
    return [_ride_to_out(r) for r in rides]


@router.get("/pricing", response_model=FareRules)
def get_pricing(admin: CurrentUser = Depends(require_role("admin"))):
    rules = fare_service.get_fare_rules()
    return FareRules(
        base_fare=rules["baseFare"],
        per_km_rate=rules["perKmRate"],
        per_min_rate=rules["perMinRate"],
        booking_fee=rules["bookingFee"],
        minimum_fare=rules["minimumFare"],
        per_kg_rate=rules["perKgRate"],
        per_m3_rate=rules["perM3Rate"],
        pool_discount_pct=rules["poolDiscountPct"],
        peak_hour_multiplier=rules["peakHourMultiplier"],
        night_multiplier=rules["nightMultiplier"],
        surge_enabled=rules["surgeEnabled"],
        surge_cap=rules["surgeCap"],
        cancellation_fee=rules["cancellationFee"],
        cancellation_free_window_sec=rules["cancellationFreeWindowSec"],
    )


@router.put("/pricing", response_model=FareRules)
def update_pricing(
    payload: FareRules,
    admin: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    fare_service.save_fare_rules(db, payload)
    return payload


@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(admin: CurrentUser = Depends(require_role("admin")), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_passengers = db.query(func.count(User.uid)).filter(User.role == "passenger").scalar()
    total_drivers = db.query(func.count(User.uid)).filter(User.role == "driver").scalar()
    pending_drivers = (
        db.query(func.count(User.uid))
        .filter(User.role == "driver", User.status == "pending_approval")
        .scalar()
    )
    online_drivers = (
        db.query(func.count(DriverProfile.uid))
        .filter(DriverProfile.online_status.in_(["online", "on_trip"]))
        .scalar()
    )
    total_rides = db.query(func.count(Ride.id)).scalar()
    completed_rides = db.query(func.count(Ride.id)).filter(Ride.status == "completed").scalar()
    rides_today = db.query(func.count(Ride.id)).filter(Ride.requested_at >= today_start).scalar()
    # complete_ride always writes final_fare when a ride completes, so this is
    # accurate for anything completed through the current code path.
    total_revenue = (
        db.query(func.coalesce(func.sum(Ride.final_fare), 0)).filter(Ride.status == "completed").scalar()
    )

    return DashboardStats(
        total_passengers=total_passengers,
        total_drivers=total_drivers,
        pending_drivers=pending_drivers,
        online_drivers=online_drivers,
        total_rides=total_rides,
        completed_rides=completed_rides,
        rides_today=rides_today,
        total_revenue=round(float(total_revenue), 2),
    )
