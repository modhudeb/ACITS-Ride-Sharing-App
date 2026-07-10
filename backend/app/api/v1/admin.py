from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth as firebase_auth

from app.core.config import get_settings
from app.core.firebase import get_firebase_app, get_firestore_client
from app.core.rate_limit import rate_limit_by_ip
from app.core.security import CurrentUser, require_role
from app.models.admin import AdminLoginRequest, AdminLoginResponse, DashboardStats, FareRules
from app.models.user import DriverOut, DriverStatusUpdate, UserOut, UserStatusUpdate
from app.services import fare_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(
    payload: AdminLoginRequest,
    _: None = Depends(rate_limit_by_ip("admin.login", max_calls=10, window_seconds=60)),
):
    settings = get_settings()
    if payload.username != settings.admin_username or payload.password != settings.admin_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin username or password",
        )

    get_firebase_app()
    email = f"{settings.admin_username}@acits.internal"

    try:
        user = firebase_auth.get_user_by_email(email)
    except firebase_auth.UserNotFoundError:
        user = firebase_auth.create_user(email=email, display_name="Administrator")

    db = get_firestore_client()
    db.collection("users").document(user.uid).set(
        {"role": "admin", "name": "Administrator", "email": email, "status": "active"},
        merge=True,
    )

    custom_token = firebase_auth.create_custom_token(user.uid)
    return AdminLoginResponse(custom_token=custom_token.decode("utf-8"))


@router.get("/drivers", response_model=list[DriverOut])
def list_drivers(
    driver_status: str | None = None,
    admin: CurrentUser = Depends(require_role("admin")),
):
    db = get_firestore_client()
    query = db.collection("users").where("role", "==", "driver")
    if driver_status:
        query = query.where("status", "==", driver_status)

    return [
        DriverOut(
            uid=doc.id,
            name=doc.to_dict().get("name"),
            email=doc.to_dict().get("email"),
            status=doc.to_dict().get("status", "pending_approval"),
        )
        for doc in query.stream()
    ]


@router.patch("/drivers/{uid}", response_model=DriverOut)
def update_driver_status(
    uid: str,
    payload: DriverStatusUpdate,
    admin: CurrentUser = Depends(require_role("admin")),
):
    db = get_firestore_client()
    user_ref = db.collection("users").document(uid)
    snapshot = user_ref.get()

    if not snapshot.exists or snapshot.to_dict().get("role") != "driver":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    user_ref.update({"status": payload.status})
    data = snapshot.to_dict()
    return DriverOut(uid=uid, name=data.get("name"), email=data.get("email"), status=payload.status)


@router.get("/passengers", response_model=list[UserOut])
def list_passengers(admin: CurrentUser = Depends(require_role("admin"))):
    db = get_firestore_client()
    return [
        UserOut(
            uid=doc.id,
            name=doc.to_dict().get("name"),
            email=doc.to_dict().get("email"),
            role="passenger",
            status=doc.to_dict().get("status", "active"),
        )
        for doc in db.collection("users").where("role", "==", "passenger").stream()
    ]


@router.patch("/passengers/{uid}", response_model=UserOut)
def update_passenger_status(
    uid: str,
    payload: UserStatusUpdate,
    admin: CurrentUser = Depends(require_role("admin")),
):
    db = get_firestore_client()
    user_ref = db.collection("users").document(uid)
    snapshot = user_ref.get()

    if not snapshot.exists or snapshot.to_dict().get("role") != "passenger":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passenger not found")

    user_ref.update({"status": payload.status})
    data = snapshot.to_dict()
    return UserOut(uid=uid, name=data.get("name"), email=data.get("email"), role="passenger", status=payload.status)


@router.get("/rides")
def list_rides(
    ride_status: str | None = None,
    limit: int = 100,
    admin: CurrentUser = Depends(require_role("admin")),
):
    db = get_firestore_client()
    query = db.collection("rides")
    if ride_status:
        query = query.where("status", "==", ride_status)

    rides = []
    for doc in query.stream():
        data = doc.to_dict()
        requested_at = data.get("requestedAt")
        rides.append(
            {
                "id": doc.id,
                "passenger_name": data.get("passengerName"),
                "driver_name": data.get("driverName"),
                "status": data.get("status"),
                "pickup_address": (data.get("pickup") or {}).get("address"),
                "destination_address": (data.get("destination") or {}).get("address"),
                "distance_meters": data.get("distanceMeters"),
                "fare_estimate": data.get("fareEstimate"),
                "final_fare": data.get("finalFare"),
                "goods": data.get("goods") or {},
                "cancellation_fee": data.get("cancellationFee"),
                "cancel_reason": data.get("cancelReason"),
                "requested_at": requested_at.isoformat() if requested_at else None,
            }
        )

    rides.sort(key=lambda r: r["requested_at"] or "", reverse=True)
    return rides[: max(1, min(limit, 500))]


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
):
    db = get_firestore_client()
    db.collection("fare_rules").document("config").set(
        {
            "baseFare": payload.base_fare,
            "perKmRate": payload.per_km_rate,
            "perMinRate": payload.per_min_rate,
            "bookingFee": payload.booking_fee,
            "minimumFare": payload.minimum_fare,
            "perKgRate": payload.per_kg_rate,
            "perM3Rate": payload.per_m3_rate,
            "poolDiscountPct": payload.pool_discount_pct,
            "peakHourMultiplier": payload.peak_hour_multiplier,
            "nightMultiplier": payload.night_multiplier,
            "surgeEnabled": payload.surge_enabled,
            "surgeCap": payload.surge_cap,
            "cancellationFee": payload.cancellation_fee,
            "cancellationFreeWindowSec": payload.cancellation_free_window_sec,
        },
        merge=True,
    )
    return payload


@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(admin: CurrentUser = Depends(require_role("admin"))):
    db = get_firestore_client()

    total_passengers = 0
    total_drivers = 0
    pending_drivers = 0
    for doc in db.collection("users").stream():
        data = doc.to_dict()
        if data.get("role") == "passenger":
            total_passengers += 1
        elif data.get("role") == "driver":
            total_drivers += 1
            if data.get("status") == "pending_approval":
                pending_drivers += 1

    online_drivers = 0
    for doc in db.collection("driver_profiles").stream():
        if doc.to_dict().get("onlineStatus") in ("online", "on_trip"):
            online_drivers += 1

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_rides = 0
    completed_rides = 0
    rides_today = 0
    total_revenue = 0.0
    for doc in db.collection("rides").stream():
        data = doc.to_dict()
        total_rides += 1
        if data.get("status") == "completed":
            completed_rides += 1
            total_revenue += data.get("finalFare") or data.get("fareEstimate") or 0
        requested_at = data.get("requestedAt")
        if requested_at and requested_at >= today_start:
            rides_today += 1

    return DashboardStats(
        total_passengers=total_passengers,
        total_drivers=total_drivers,
        pending_drivers=pending_drivers,
        online_drivers=online_drivers,
        total_rides=total_rides,
        completed_rides=completed_rides,
        rides_today=rides_today,
        total_revenue=round(total_revenue, 2),
    )
