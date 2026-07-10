import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth as firebase_auth
from firebase_admin import firestore

from app.core.config import get_settings
from app.core.firebase import get_firebase_app, get_firestore_client
from app.core.rate_limit import rate_limit_by_ip
from app.core.security import CurrentUser, require_role
from app.models.admin import AdminLoginRequest, AdminLoginResponse, DashboardStats, FareRules
from app.models.user import DriverOut, DriverStatusUpdate, UserOut, UserStatusUpdate
from app.services import fare_service

router = APIRouter(prefix="/admin", tags=["admin"])


def _count(query) -> int:
    """Firestore count() aggregation - billed as a single read no matter how
    many documents match, instead of streaming (and paying for) every one."""
    result = query.count().get()
    return int(result[0][0].value)


def _sum(query, field: str) -> float:
    result = query.sum(field).get()
    return float(result[0][0].value or 0.0)


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(
    payload: AdminLoginRequest,
    _: None = Depends(rate_limit_by_ip("admin.login", max_calls=10, window_seconds=60)),
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

    # Persist the claim (covers tokens minted later by a silent refresh) and
    # also embed it directly in this custom token's payload, so the very
    # first ID token exchanged from it already carries "role" - no separate
    # /auth/claims round trip needed for the admin gate.
    firebase_auth.set_custom_user_claims(user.uid, {"role": "admin"})
    custom_token = firebase_auth.create_custom_token(user.uid, {"role": "admin"})
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
    query = query.limit(500)

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
        for doc in db.collection("users")
        .where("role", "==", "passenger")
        .limit(500)
        .stream()
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
    capped_limit = max(1, min(limit, 500))

    # `limit` used to be accepted but never applied to the query - this
    # streamed (and paid for) the entire rides collection on every call
    # regardless of what the caller asked for. Ordering by requestedAt here
    # needs a composite index (rides: status ASC, requestedAt DESC) - see
    # firestore.indexes.json.
    query = db.collection("rides").order_by(
        "requestedAt", direction=firestore.Query.DESCENDING
    )
    if ride_status:
        query = query.where("status", "==", ride_status)
    query = query.limit(capped_limit)

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

    return rides


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
    # New rates should apply to the very next estimate, not a minute from now.
    fare_service.invalidate_fare_rules_cache()
    return payload


@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(admin: CurrentUser = Depends(require_role("admin"))):
    # Every figure here used to come from streaming (and paying to read)
    # entire collections on every dashboard load. count()/sum() aggregations
    # are billed as a single read each regardless of how many docs match.
    db = get_firestore_client()
    users_ref = db.collection("users")
    rides_ref = db.collection("rides")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_passengers = _count(users_ref.where("role", "==", "passenger"))
    total_drivers = _count(users_ref.where("role", "==", "driver"))
    pending_drivers = _count(
        users_ref.where("role", "==", "driver").where("status", "==", "pending_approval")
    )
    online_drivers = _count(
        db.collection("driver_profiles").where("onlineStatus", "in", ["online", "on_trip"])
    )
    total_rides = _count(rides_ref)
    completed_rides = _count(rides_ref.where("status", "==", "completed"))
    rides_today = _count(rides_ref.where("requestedAt", ">=", today_start))
    # complete_ride always writes finalFare when a ride completes, so this is
    # accurate for anything completed through the current code path.
    total_revenue = _sum(rides_ref.where("status", "==", "completed"), "finalFare")

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
