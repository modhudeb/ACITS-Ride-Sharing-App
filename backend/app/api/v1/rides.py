import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import firestore

from app.core.firebase import get_firestore_client
from app.core.rate_limit import rate_limit, rate_limit_by_ip
from app.core.security import CurrentUser, get_current_user, require_role
from app.models.ride import (
    CancelRideRequest,
    RateRideRequest,
    RideCreateRequest,
    RideHistoryItem,
    RideOut,
)
from app.services import fare_service, geohash, maps_service, surge_service
from app.services.fare_service import get_fare_rules

router = APIRouter(prefix="/rides", tags=["rides"])

ACTIVE_STATUSES = ("scheduled", "requested", "accepted", "in_progress")

# Scheduled rides must be at least this far out (otherwise book now) and at
# most a week ahead.
MIN_SCHEDULE_LEAD = timedelta(minutes=10)
MAX_SCHEDULE_AHEAD = timedelta(days=7)

# Requests nobody accepts within this window are treated as expired.
REQUEST_TTL = timedelta(minutes=3)


def _get_user_name(uid: str) -> str | None:
    doc = get_firestore_client().collection("users").document(uid).get()
    return doc.to_dict().get("name") if doc.exists else None


def _ride_to_out(ride_id: str, data: dict) -> RideOut:
    return RideOut(
        id=ride_id,
        passenger_id=data["passengerId"],
        passenger_name=data.get("passengerName"),
        driver_id=data.get("driverId"),
        driver_name=data.get("driverName"),
        status=data["status"],
        pickup=data["pickup"],
        destination=data["destination"],
        distance_meters=data["distanceMeters"],
        duration_seconds=data["durationSeconds"],
        route_path=data["routePath"],
        fare_estimate=data["fareEstimate"],
        fare_breakdown=data["fareBreakdown"],
        goods=data.get("goods") or {},
        scheduled_at=data.get("scheduledAt"),
        final_fare=data.get("finalFare"),
        cancellation_fee=data.get("cancellationFee"),
        cancel_reason=data.get("cancelReason"),
    )


def _get_ride_or_404(db, ride_id: str):
    ride_ref = db.collection("rides").document(ride_id)
    snapshot = ride_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")
    return ride_ref, snapshot


def broadcast_ride_request(db, ride_id: str, ride_data: dict) -> None:
    """Publish the doc online drivers listen to. Shared with the scheduler."""
    db.collection("ride_requests").document(ride_id).set(
        {
            "rideId": ride_id,
            "passengerName": ride_data.get("passengerName"),
            "pickup": ride_data["pickup"],
            "destination": ride_data["destination"],
            "goods": ride_data.get("goods") or {},
            "distanceMeters": ride_data["distanceMeters"],
            "durationSeconds": ride_data["durationSeconds"],
            "fareEstimate": ride_data["fareEstimate"],
            "geohash": geohash.encode(
                ride_data["pickup"]["lat"], ride_data["pickup"]["lng"]
            ),
            "status": "pending",
            "declinedBy": [],
            "createdAt": firestore.SERVER_TIMESTAMP,
            "expiresAt": datetime.now(timezone.utc) + REQUEST_TTL,
        }
    )


def _ensure_participant(data: dict, current_user: CurrentUser):
    if current_user.role == "admin":
        return
    if current_user.uid not in (data.get("passengerId"), data.get("driverId")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not part of this ride")


@router.post("", response_model=RideOut)
async def create_ride(
    payload: RideCreateRequest,
    current_user: CurrentUser = Depends(require_role("passenger")),
    _: CurrentUser = Depends(rate_limit("rides.create", max_calls=5, window_seconds=60)),
):
    db = get_firestore_client()

    existing_active = [
        doc
        for doc in db.collection("rides").where("passengerId", "==", current_user.uid).stream()
        if doc.to_dict().get("status") in ACTIVE_STATUSES
    ]
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an active ride",
        )

    scheduled_at = payload.scheduled_at
    if scheduled_at is not None:
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if scheduled_at < now + MIN_SCHEDULE_LEAD:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scheduled time must be at least 10 minutes from now",
            )
        if scheduled_at > now + MAX_SCHEDULE_AHEAD:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rides can be scheduled at most 7 days ahead",
            )

    # The route/fare the client sends is only ever a preview from
    # /routes/estimate a moment earlier - never trust it for money. Recompute
    # both from scratch here so the charged fare can't be forged by calling
    # this endpoint directly with a fabricated distance or fare_estimate.
    route = await maps_service.compute_route(payload.pickup, payload.destination)
    rules = fare_service.get_fare_rules()
    surge = surge_service.compute_surge(payload.pickup.lat, payload.pickup.lng, rules=rules)
    fare = fare_service.calculate_fare(
        route["distance_meters"],
        route["duration_seconds"],
        goods_weight_kg=payload.goods.weight_kg,
        goods_volume_m3=payload.goods.volume_m3,
        surge_multiplier=surge,
        at=datetime.now(),
        rules=rules,
    )

    ride_ref = db.collection("rides").document()
    goods = payload.goods.model_dump()
    passenger_name = _get_user_name(current_user.uid)

    ride_data = {
        "passengerId": current_user.uid,
        "passengerName": passenger_name,
        "driverId": None,
        "driverName": None,
        "status": "scheduled" if scheduled_at else "requested",
        "scheduledAt": scheduled_at,
        "pickup": payload.pickup.model_dump(),
        "destination": payload.destination.model_dump(),
        "distanceMeters": route["distance_meters"],
        "durationSeconds": route["duration_seconds"],
        "routePath": route["route_path"],
        "fareEstimate": fare["total"],
        "fareBreakdown": fare,
        "goods": goods,
        "cancelReason": None,
        # Random token gating the public share-my-trip page.
        "shareToken": secrets.token_urlsafe(16),
        "requestedAt": firestore.SERVER_TIMESTAMP,
    }
    ride_ref.set(ride_data)

    # Scheduled rides are broadcast to drivers later by the background
    # sweeper, shortly before their pickup time.
    if not scheduled_at:
        broadcast_ride_request(db, ride_ref.id, ride_data)

    return _ride_to_out(ride_ref.id, ride_data)


@router.get("/history", response_model=list[RideHistoryItem])
def get_ride_history(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role not in ("passenger", "driver"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not available for this role",
        )

    db = get_firestore_client()
    field = "passengerId" if current_user.role == "passenger" else "driverId"
    query = db.collection("rides").where(field, "==", current_user.uid)

    items = []
    for doc in query.stream():
        data = doc.to_dict()
        if data.get("status") not in ("completed", "cancelled"):
            continue

        counterparty_name = (
            data.get("driverName")
            if current_user.role == "passenger"
            else data.get("passengerName")
        )
        requested_at = data.get("requestedAt")
        completed_at = data.get("completedAt")

        items.append(
            RideHistoryItem(
                id=doc.id,
                role=current_user.role,
                counterparty_name=counterparty_name,
                status=data["status"],
                pickup=data["pickup"],
                destination=data["destination"],
                distance_meters=data["distanceMeters"],
                duration_seconds=data["durationSeconds"],
                fare_estimate=data["fareEstimate"],
                goods=data.get("goods") or {},
                final_fare=data.get("finalFare"),
                cancellation_fee=data.get("cancellationFee"),
                cancel_reason=data.get("cancelReason"),
                rated_by_me=bool(
                    data.get(
                        "ratedByPassenger"
                        if current_user.role == "passenger"
                        else "ratedByDriver"
                    )
                ),
                requested_at=requested_at.isoformat() if requested_at else None,
                completed_at=completed_at.isoformat() if completed_at else None,
            )
        )

    items.sort(key=lambda item: item.requested_at or "", reverse=True)
    return items[:50]


@router.get("/{ride_id}/shared", dependencies=[Depends(rate_limit_by_ip("rides.shared", max_calls=30, window_seconds=60))])
def get_shared_ride(ride_id: str, token: str):
    """Public, token-gated view for the share-my-trip page - no login needed.

    Returns only what a family member needs to follow the trip; polled by the
    share page since anonymous viewers can't hold Firestore listeners.
    """
    db = get_firestore_client()
    _, snapshot = _get_ride_or_404(db, ride_id)
    data = snapshot.to_dict()

    if not token or data.get("shareToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid share link")

    driver_location = None
    vehicle = None
    if data.get("driverId"):
        profile = db.collection("driver_profiles").document(data["driverId"]).get()
        if profile.exists:
            profile_data = profile.to_dict()
            loc = profile_data.get("currentLocation") or {}
            if loc.get("lat") is not None:
                driver_location = {"lat": loc["lat"], "lng": loc["lng"]}
            vehicle = profile_data.get("vehicle")

    return {
        "status": data["status"],
        "passenger_name": data.get("passengerName"),
        "driver_name": data.get("driverName"),
        "vehicle": vehicle,
        "pickup": data["pickup"],
        "destination": data["destination"],
        "route_path": data["routePath"],
        "driver_location": driver_location,
    }


@router.get("/{ride_id}", response_model=RideOut)
def get_ride(ride_id: str, current_user: CurrentUser = Depends(get_current_user)):
    db = get_firestore_client()
    _, snapshot = _get_ride_or_404(db, ride_id)
    data = snapshot.to_dict()
    _ensure_participant(data, current_user)
    return _ride_to_out(ride_id, data)


@router.post("/{ride_id}/cancel", response_model=RideOut)
def cancel_ride(
    ride_id: str,
    payload: CancelRideRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    db = get_firestore_client()
    ride_ref, snapshot = _get_ride_or_404(db, ride_id)
    data = snapshot.to_dict()
    _ensure_participant(data, current_user)

    if data["status"] not in ("scheduled", "requested", "accepted"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride can no longer be cancelled",
        )

    # Passengers cancelling after a driver committed (past the free window) pay
    # a fee; drivers/admins cancelling never charge the passenger.
    cancellation_fee = 0.0
    accepted_at = data.get("acceptedAt")
    if (
        current_user.uid == data.get("passengerId")
        and data["status"] == "accepted"
        and accepted_at is not None
    ):
        rules = get_fare_rules()
        free_window = timedelta(seconds=rules.get("cancellationFreeWindowSec", 120))
        if datetime.now(timezone.utc) - accepted_at > free_window:
            cancellation_fee = float(rules.get("cancellationFee", 0))

    updates = {
        "status": "cancelled",
        "cancelReason": payload.reason or "Cancelled",
        "cancellationFee": cancellation_fee,
    }
    ride_ref.update({**updates, "cancelledAt": firestore.SERVER_TIMESTAMP})
    db.collection("ride_requests").document(ride_id).set(
        {"status": "cancelled"}, merge=True
    )

    data.update(updates)
    return _ride_to_out(ride_id, data)


@router.post("/{ride_id}/accept", response_model=RideOut)
def accept_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
    _: CurrentUser = Depends(rate_limit("rides.accept", max_calls=20, window_seconds=60)),
):
    db = get_firestore_client()

    driver_ref = db.collection("driver_profiles").document(current_user.uid)
    driver_profile = driver_ref.get()
    profile_data = driver_profile.to_dict() if driver_profile.exists else {}

    if profile_data.get("onlineStatus") != "online":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be online to accept rides",
        )

    capacity = profile_data.get("capacity")
    if not capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set up your truck details before accepting rides",
        )

    ride_ref = db.collection("rides").document(ride_id)
    ride_request_ref = db.collection("ride_requests").document(ride_id)
    active_rides_query = db.collection("rides").where("driverId", "==", current_user.uid)
    driver_name = _get_user_name(current_user.uid)

    transaction = db.transaction()

    @firestore.transactional
    def _accept(transaction):
        snapshot = ride_ref.get(transaction=transaction)
        if not snapshot.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")

        data = snapshot.to_dict()
        if data["status"] != "requested" or data.get("driverId"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ride is no longer available",
            )

        # Pooled capacity ledger: the truck's remaining space is its capacity
        # minus everything already on board or committed to.
        used_kg = used_m3 = riders = 0
        for doc in transaction.get(active_rides_query):
            active = doc.to_dict()
            if active.get("status") not in ("accepted", "in_progress"):
                continue
            goods = active.get("goods") or {}
            used_kg += goods.get("weight_kg", 0) or 0
            used_m3 += goods.get("volume_m3", 0) or 0
            riders += 1

        goods = data.get("goods") or {}
        need_kg = goods.get("weight_kg", 0) or 0
        need_m3 = goods.get("volume_m3", 0) or 0

        if riders + 1 > capacity.get("maxPassengers", 1):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No passenger seat left on your truck",
            )
        if used_kg + need_kg > capacity.get("maxWeightKg", 0):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Not enough weight capacity left for this load",
            )
        if used_m3 + need_m3 > capacity.get("maxVolumeM3", 0):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Not enough cargo space left for this load",
            )

        updates = {
            "driverId": current_user.uid,
            "driverName": driver_name,
            "status": "accepted",
        }
        transaction.update(ride_ref, {**updates, "acceptedAt": firestore.SERVER_TIMESTAMP})
        transaction.update(ride_request_ref, {"status": "matched"})

        data.update(updates)
        return data

    updated_data = _accept(transaction)
    return _ride_to_out(ride_id, updated_data)


@router.post("/{ride_id}/reject")
def reject_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
):
    db = get_firestore_client()
    ride_request_ref = db.collection("ride_requests").document(ride_id)
    if not ride_request_ref.get().exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride request not found")

    ride_request_ref.update({"declinedBy": firestore.ArrayUnion([current_user.uid])})
    return {"status": "ok"}


@router.post("/{ride_id}/start", response_model=RideOut)
def start_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
):
    db = get_firestore_client()
    ride_ref, snapshot = _get_ride_or_404(db, ride_id)
    data = snapshot.to_dict()

    if data.get("driverId") != current_user.uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ride")
    if data["status"] != "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride cannot be started from its current status",
        )

    updates = {"status": "in_progress"}
    ride_ref.update({**updates, "startedAt": firestore.SERVER_TIMESTAMP})

    data.update(updates)
    return _ride_to_out(ride_id, data)


@router.post("/{ride_id}/rate")
def rate_ride(
    ride_id: str,
    payload: RateRideRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(rate_limit("rides.rate", max_calls=10, window_seconds=60)),
):
    db = get_firestore_client()
    ride_ref, snapshot = _get_ride_or_404(db, ride_id)
    data = snapshot.to_dict()

    if current_user.uid == data.get("passengerId"):
        rater_role = "passenger"
        rated_uid = data.get("driverId")
        flag_field = "ratedByPassenger"
    elif current_user.uid == data.get("driverId"):
        rater_role = "driver"
        rated_uid = data.get("passengerId")
        flag_field = "ratedByDriver"
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not part of this ride")

    if data["status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only completed rides can be rated",
        )
    if data.get(flag_field):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already rated this ride",
        )
    if not rated_uid:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nobody to rate")

    db.collection("ratings").document(ride_id).set(
        {
            "rideId": ride_id,
            "passengerId": data.get("passengerId"),
            "driverId": data.get("driverId"),
            f"by_{rater_role}": {
                "rating": payload.rating,
                "comment": payload.comment,
                "at": firestore.SERVER_TIMESTAMP,
            },
        },
        merge=True,
    )
    ride_ref.update({flag_field: True})

    # Running average on the rated user's profile doc.
    profile_ref = (
        db.collection("driver_profiles").document(rated_uid)
        if rater_role == "passenger"
        else db.collection("users").document(rated_uid)
    )
    transaction = db.transaction()

    @firestore.transactional
    def _update_avg(transaction):
        profile = profile_ref.get(transaction=transaction)
        existing = (profile.to_dict() or {}).get("rating") or {}
        count = existing.get("count", 0)
        avg = existing.get("avg", 0.0)
        new_count = count + 1
        new_avg = round((avg * count + payload.rating) / new_count, 2)
        transaction.set(
            profile_ref,
            {"rating": {"avg": new_avg, "count": new_count}},
            merge=True,
        )

    _update_avg(transaction)
    return {"status": "ok"}


@router.post("/{ride_id}/complete", response_model=RideOut)
def complete_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
):
    db = get_firestore_client()
    ride_ref, snapshot = _get_ride_or_404(db, ride_id)
    data = snapshot.to_dict()

    if data.get("driverId") != current_user.uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ride")
    if data["status"] != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride cannot be completed from its current status",
        )

    updates = {"status": "completed", "finalFare": data["fareEstimate"]}
    ride_ref.update({**updates, "completedAt": firestore.SERVER_TIMESTAMP})

    data.update(updates)
    return _ride_to_out(ride_id, data)
