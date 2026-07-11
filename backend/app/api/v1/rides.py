import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.rate_limit import rate_limit, rate_limit_by_ip
from app.core.realtime import manager
from app.core.security import CurrentUser, get_current_user, require_role
from app.db.models import DriverProfile, Rating, Ride, RideMessage, RideRequest, User
from app.db.session import get_db
from app.models.ride import (
    Address,
    CancelRideRequest,
    RateRideRequest,
    RideCreateRequest,
    RideHistoryItem,
    RideOut,
)
from app.services import capacity_service, fare_service, geohash, maps_service, surge_service
from app.services.expiry_service import SCHEDULE_BROADCAST_LEAD
from app.services.fare_service import get_fare_rules

router = APIRouter(prefix="/rides", tags=["rides"])

ACTIVE_STATUSES = ("scheduled", "requested", "accepted", "in_progress")
DRIVER_ACTIVE_STATUSES = ("accepted", "in_progress")

# Scheduled rides must be at least this far out (otherwise book now) and at
# most a week ahead.
MIN_SCHEDULE_LEAD = timedelta(minutes=10)
MAX_SCHEDULE_AHEAD = timedelta(days=7)

# Requests nobody accepts within this window are treated as expired.
REQUEST_TTL = timedelta(minutes=3)


def _get_user_name(db: Session, uid: str) -> str | None:
    user = db.get(User, uid)
    return user.name if user else None


def _ride_to_out(ride: Ride) -> RideOut:
    return RideOut(
        id=ride.id,
        passenger_id=ride.passenger_id,
        passenger_name=ride.passenger_name,
        driver_id=ride.driver_id,
        driver_name=ride.driver_name,
        status=ride.status,
        pickup=Address(lat=ride.pickup_lat, lng=ride.pickup_lng, address=ride.pickup_address),
        destination=Address(
            lat=ride.destination_lat, lng=ride.destination_lng, address=ride.destination_address
        ),
        distance_meters=ride.distance_meters,
        duration_seconds=ride.duration_seconds,
        route_path=ride.route_path,
        fare_estimate=ride.fare_estimate,
        fare_breakdown=ride.fare_breakdown,
        goods={
            "weight_kg": ride.goods_weight_kg,
            "volume_m3": ride.goods_volume_m3,
            "description": ride.goods_description,
        },
        scheduled_at=ride.scheduled_at,
        final_fare=ride.final_fare,
        cancellation_fee=ride.cancellation_fee,
        cancel_reason=ride.cancel_reason,
        share_token=ride.share_token,
        rated_by_passenger=ride.rated_by_passenger,
        rated_by_driver=ride.rated_by_driver,
    )


def _get_ride_or_404(db: Session, ride_id: str) -> Ride:
    ride = db.get(Ride, ride_id)
    if not ride:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")
    return ride


def _ensure_participant(ride: Ride, current_user: CurrentUser):
    if current_user.role == "admin":
        return
    if current_user.uid not in (ride.passenger_id, ride.driver_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not part of this ride")


def _push_ride(ride: Ride) -> None:
    """Push the ride's full new state to anyone watching it directly, and
    signal both participants' "do I have an active ride" listeners plus the
    admin console to refetch their small list views."""
    payload = _ride_to_out(ride).model_dump(mode="json")
    manager.broadcast(f"ride:{ride.id}", {"topic": f"ride:{ride.id}", "type": "state", "data": payload})
    manager.broadcast(f"rides:{ride.passenger_id}", {"topic": f"rides:{ride.passenger_id}", "type": "signal"})
    if ride.driver_id:
        manager.broadcast(f"rides:{ride.driver_id}", {"topic": f"rides:{ride.driver_id}", "type": "signal"})
    manager.broadcast("admin_ops", {"topic": "admin_ops", "type": "signal"})


def _push_driver_feed() -> None:
    manager.broadcast("driver_feed", {"topic": "driver_feed", "type": "signal"})


def broadcast_ride_request(db: Session, ride: Ride) -> None:
    """Publish the row online drivers' pending-request feed picks up -
    shared with the scheduled-ride promotion sweep."""
    db.add(
        RideRequest(
            ride_id=ride.id,
            passenger_name=ride.passenger_name,
            pickup={"lat": ride.pickup_lat, "lng": ride.pickup_lng, "address": ride.pickup_address},
            destination={
                "lat": ride.destination_lat,
                "lng": ride.destination_lng,
                "address": ride.destination_address,
            },
            goods={"weight_kg": ride.goods_weight_kg, "volume_m3": ride.goods_volume_m3},
            distance_meters=ride.distance_meters,
            duration_seconds=ride.duration_seconds,
            fare_estimate=ride.fare_estimate,
            geohash=geohash.encode(ride.pickup_lat, ride.pickup_lng),
            status="pending",
            declined_by=[],
            created_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + REQUEST_TTL,
        )
    )
    # Caller broadcasts driver_feed itself, after its own commit() - a
    # subscriber that refetches on a signal fired before the transaction
    # commits could miss the very row that signal was about.


@router.post("", response_model=RideOut)
async def create_ride(
    payload: RideCreateRequest,
    current_user: CurrentUser = Depends(require_role("passenger")),
    _: CurrentUser = Depends(rate_limit("rides.create", max_calls=5, window_seconds=60)),
    db: Session = Depends(get_db),
):
    existing_active = (
        db.query(Ride)
        .filter(Ride.passenger_id == current_user.uid, Ride.status.in_(ACTIVE_STATUSES))
        .first()
    )
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
        # No `at=` - fare_service defaults to now() in Asia/Dhaka time, which
        # is what the peak/night windows are actually defined against.
        rules=rules,
    )

    ride = Ride(
        id=str(uuid.uuid4()),
        passenger_id=current_user.uid,
        passenger_name=_get_user_name(db, current_user.uid),
        status="scheduled" if scheduled_at else "requested",
        scheduled_at=scheduled_at,
        # Present only while waiting to be broadcast - the sweeper range-scans
        # this column and clears it on promotion, so far-future scheduled
        # rides are never re-scanned sweep after sweep (see expiry_service).
        schedule_broadcast_at=(scheduled_at - SCHEDULE_BROADCAST_LEAD) if scheduled_at else None,
        pickup_lat=payload.pickup.lat,
        pickup_lng=payload.pickup.lng,
        pickup_address=payload.pickup.address,
        destination_lat=payload.destination.lat,
        destination_lng=payload.destination.lng,
        destination_address=payload.destination.address,
        distance_meters=route["distance_meters"],
        duration_seconds=route["duration_seconds"],
        route_path=route["route_path"],
        fare_estimate=fare["total"],
        fare_breakdown=fare,
        goods_weight_kg=payload.goods.weight_kg,
        goods_volume_m3=payload.goods.volume_m3,
        goods_description=payload.goods.description,
        # Random token gating the public share-my-trip page.
        share_token=secrets.token_urlsafe(16),
        requested_at=datetime.now(timezone.utc),
    )
    db.add(ride)

    # Scheduled rides are broadcast to drivers later by the background
    # sweeper, shortly before their pickup time.
    if not scheduled_at:
        broadcast_ride_request(db, ride)

    db.commit()
    db.refresh(ride)
    _push_ride(ride)
    if not scheduled_at:
        _push_driver_feed()
    return _ride_to_out(ride)


@router.get("/active", response_model=list[RideOut])
def get_active_rides(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Backs the "do I currently have an active ride" hooks - they get a
    signal on the rides:{uid} topic and refetch this instead of trying to
    reconstruct list state purely from a stream of partial WS events."""
    rides = (
        db.query(Ride)
        .filter(
            or_(Ride.passenger_id == current_user.uid, Ride.driver_id == current_user.uid),
            Ride.status.in_(ACTIVE_STATUSES),
        )
        .order_by(Ride.requested_at.desc())
        .limit(10)
        .all()
    )
    return [_ride_to_out(r) for r in rides]


@router.get("/pending")
def get_pending_requests(
    current_user: CurrentUser = Depends(require_role("driver", "admin")),
    db: Session = Depends(get_db),
):
    """A driver's live pending-request feed - refetched whenever the
    driver_feed WS topic signals a change (new request, or one taken/expired)."""
    now = datetime.now(timezone.utc)
    requests = (
        db.query(RideRequest)
        .filter(RideRequest.status == "pending", RideRequest.expires_at > now)
        .order_by(RideRequest.created_at.asc())
        .limit(100)
        .all()
    )
    return [
        {
            "ride_id": r.ride_id,
            "passenger_name": r.passenger_name,
            "pickup": r.pickup,
            "destination": r.destination,
            "goods": r.goods,
            "distance_meters": r.distance_meters,
            "duration_seconds": r.duration_seconds,
            "fare_estimate": r.fare_estimate,
            "expires_at": r.expires_at.isoformat(),
        }
        for r in requests
        if current_user.uid not in (r.declined_by or [])
    ]


@router.get("/history", response_model=list[RideHistoryItem])
def get_ride_history(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("passenger", "driver"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not available for this role",
        )

    field = Ride.passenger_id if current_user.role == "passenger" else Ride.driver_id
    rides = (
        db.query(Ride)
        .filter(field == current_user.uid, Ride.status.in_(["completed", "cancelled"]))
        .order_by(Ride.requested_at.desc())
        .limit(50)
        .all()
    )

    items = []
    for ride in rides:
        counterparty_name = (
            ride.driver_name if current_user.role == "passenger" else ride.passenger_name
        )
        items.append(
            RideHistoryItem(
                id=ride.id,
                role=current_user.role,
                counterparty_name=counterparty_name,
                status=ride.status,
                pickup=Address(lat=ride.pickup_lat, lng=ride.pickup_lng, address=ride.pickup_address),
                destination=Address(
                    lat=ride.destination_lat, lng=ride.destination_lng, address=ride.destination_address
                ),
                distance_meters=ride.distance_meters,
                duration_seconds=ride.duration_seconds,
                fare_estimate=ride.fare_estimate,
                goods={"weight_kg": ride.goods_weight_kg, "volume_m3": ride.goods_volume_m3},
                final_fare=ride.final_fare,
                cancellation_fee=ride.cancellation_fee,
                cancel_reason=ride.cancel_reason,
                rated_by_me=ride.rated_by_passenger if current_user.role == "passenger" else ride.rated_by_driver,
                requested_at=ride.requested_at.isoformat() if ride.requested_at else None,
                completed_at=ride.completed_at.isoformat() if ride.completed_at else None,
            )
        )

    return items


@router.get("/{ride_id}/shared", dependencies=[Depends(rate_limit_by_ip("rides.shared", max_calls=30, window_seconds=60))])
def get_shared_ride(ride_id: str, token: str, db: Session = Depends(get_db)):
    """Public, token-gated view for the share-my-trip page - no login needed.

    Returns only what a family member needs to follow the trip; polled by the
    share page since anonymous viewers can't hold a realtime subscription.
    """
    ride = _get_ride_or_404(db, ride_id)

    if not token or ride.share_token != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid share link")

    driver_location = None
    vehicle = None
    if ride.driver_id:
        profile = db.get(DriverProfile, ride.driver_id)
        if profile and profile.current_lat is not None:
            driver_location = {"lat": profile.current_lat, "lng": profile.current_lng}
        if profile and profile.vehicle_type:
            vehicle = {
                "type": profile.vehicle_type,
                "model": profile.vehicle_model,
                "plate": profile.plate_number,
            }

    return {
        "status": ride.status,
        "passenger_name": ride.passenger_name,
        "driver_name": ride.driver_name,
        "vehicle": vehicle,
        "pickup": {"lat": ride.pickup_lat, "lng": ride.pickup_lng, "address": ride.pickup_address},
        "destination": {
            "lat": ride.destination_lat,
            "lng": ride.destination_lng,
            "address": ride.destination_address,
        },
        "route_path": ride.route_path,
        "driver_location": driver_location,
    }


@router.get("/{ride_id}", response_model=RideOut)
def get_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ride = _get_ride_or_404(db, ride_id)
    _ensure_participant(ride, current_user)
    return _ride_to_out(ride)


@router.post("/{ride_id}/cancel", response_model=RideOut)
def cancel_ride(
    ride_id: str,
    payload: CancelRideRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ride = _get_ride_or_404(db, ride_id)
    _ensure_participant(ride, current_user)

    if ride.status not in ("scheduled", "requested", "accepted"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride can no longer be cancelled",
        )

    # Passengers cancelling after a driver committed (past the free window) pay
    # a fee; drivers/admins cancelling never charge the passenger.
    cancellation_fee = 0.0
    if (
        current_user.uid == ride.passenger_id
        and ride.status == "accepted"
        and ride.accepted_at is not None
    ):
        rules = get_fare_rules()
        free_window = timedelta(seconds=rules.get("cancellationFreeWindowSec", 120))
        if datetime.now(timezone.utc) - ride.accepted_at > free_window:
            cancellation_fee = float(rules.get("cancellationFee", 0))

    ride.status = "cancelled"
    ride.cancel_reason = payload.reason or "Cancelled"
    ride.cancellation_fee = cancellation_fee
    ride.cancelled_at = datetime.now(timezone.utc)
    # A cancelled scheduled ride must not linger in the sweeper's
    # schedule_broadcast_at scan.
    ride.schedule_broadcast_at = None

    # Delete rather than mark cancelled - a broadcast row has no purpose once
    # the ride it points to is dead, and leaving it around just means every
    # future sweep pays to re-scan and re-discard it forever.
    ride_request = db.get(RideRequest, ride_id)
    had_request = bool(ride_request)
    if ride_request:
        db.delete(ride_request)

    db.commit()
    db.refresh(ride)
    _push_ride(ride)
    if had_request:
        _push_driver_feed()
    return _ride_to_out(ride)


@router.post("/{ride_id}/accept", response_model=RideOut)
def accept_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
    _: CurrentUser = Depends(rate_limit("rides.accept", max_calls=20, window_seconds=60)),
    db: Session = Depends(get_db),
):
    # Row-locking the driver's own profile serializes concurrent accept calls
    # for the same driver, so two requests accepted back-to-back can't both
    # read the same stale "capacity remaining" snapshot - the Postgres
    # equivalent of the guarantee the old Firestore transaction gave.
    driver_profile = (
        db.query(DriverProfile)
        .filter(DriverProfile.uid == current_user.uid)
        .with_for_update()
        .first()
    )
    if not driver_profile or driver_profile.online_status != "online":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be online to accept rides",
        )

    capacity = driver_profile.capacity
    if not capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set up your vehicle details before accepting rides",
        )

    ride = db.query(Ride).filter(Ride.id == ride_id).with_for_update().first()
    if not ride:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")
    if ride.status != "requested" or ride.driver_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride is no longer available",
        )

    # Pooled capacity ledger: the vehicle's remaining space is its capacity
    # minus everything already on board or committed to. Pure math lives in
    # capacity_service so it's unit-tested without needing a real transaction
    # to exercise it.
    active_rides = (
        db.query(Ride)
        .filter(Ride.driver_id == current_user.uid, Ride.status.in_(DRIVER_ACTIVE_STATUSES))
        .all()
    )
    active_rides_dicts = [
        {"status": r.status, "goods": {"weight_kg": r.goods_weight_kg, "volume_m3": r.goods_volume_m3}}
        for r in active_rides
    ]
    goods = {"weight_kg": ride.goods_weight_kg, "volume_m3": ride.goods_volume_m3}
    fits, reason = capacity_service.check_capacity(capacity, active_rides_dicts, goods)
    if not fits:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)

    ride.driver_id = current_user.uid
    ride.driver_name = _get_user_name(db, current_user.uid)
    ride.status = "accepted"
    ride.accepted_at = datetime.now(timezone.utc)

    ride_request = db.get(RideRequest, ride_id)
    if ride_request:
        db.delete(ride_request)

    db.commit()
    db.refresh(ride)
    _push_ride(ride)
    _push_driver_feed()
    return _ride_to_out(ride)


@router.post("/{ride_id}/reject")
def reject_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    ride_request = db.get(RideRequest, ride_id)
    if not ride_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride request not found")

    declined = set(ride_request.declined_by or [])
    declined.add(current_user.uid)
    ride_request.declined_by = list(declined)
    db.commit()
    manager.broadcast(f"rides:{current_user.uid}", {"topic": f"rides:{current_user.uid}", "type": "signal"})
    return {"status": "ok"}


@router.post("/{ride_id}/start", response_model=RideOut)
def start_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    ride = _get_ride_or_404(db, ride_id)

    if ride.driver_id != current_user.uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ride")
    if ride.status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride cannot be started from its current status",
        )

    ride.status = "in_progress"
    ride.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ride)
    _push_ride(ride)
    return _ride_to_out(ride)


@router.post("/{ride_id}/rate")
def rate_ride(
    ride_id: str,
    payload: RateRideRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(rate_limit("rides.rate", max_calls=10, window_seconds=60)),
    db: Session = Depends(get_db),
):
    # Row-locking the ride keeps two concurrent rate calls for the same ride
    # from both passing the "already rated" check - the Postgres equivalent
    # of the all-reads-before-any-writes Firestore transaction this replaced.
    ride = db.query(Ride).filter(Ride.id == ride_id).with_for_update().first()
    if not ride:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")

    if current_user.uid == ride.passenger_id:
        rater_role = "passenger"
        rated_uid = ride.driver_id
    elif current_user.uid == ride.driver_id:
        rater_role = "driver"
        rated_uid = ride.passenger_id
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not part of this ride")

    if ride.status != "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only completed rides can be rated")
    already_rated = ride.rated_by_passenger if rater_role == "passenger" else ride.rated_by_driver
    if already_rated:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already rated this ride")
    if not rated_uid:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nobody to rate")

    # Passengers are rated on driver_profiles; drivers are rated on users -
    # lock whichever row is being updated so its running average can't race
    # with another rating landing on the same profile at the same time.
    if rater_role == "passenger":
        profile = db.query(DriverProfile).filter(DriverProfile.uid == rated_uid).with_for_update().first()
    else:
        profile = db.query(User).filter(User.uid == rated_uid).with_for_update().first()

    count = profile.rating_count if profile else 0
    avg = profile.rating_avg if profile else 0.0
    new_count = count + 1
    new_avg = round((avg * count + payload.rating) / new_count, 2)

    rating_row = db.get(Rating, ride_id)
    if not rating_row:
        rating_row = Rating(ride_id=ride_id, passenger_id=ride.passenger_id, driver_id=ride.driver_id)
        db.add(rating_row)

    entry = {"rating": payload.rating, "comment": payload.comment, "at": datetime.now(timezone.utc).isoformat()}
    if rater_role == "passenger":
        rating_row.by_passenger = entry
        ride.rated_by_passenger = True
    else:
        rating_row.by_driver = entry
        ride.rated_by_driver = True

    if profile:
        profile.rating_avg = new_avg
        profile.rating_count = new_count

    db.commit()
    _push_ride(ride)
    return {"status": "ok"}


@router.post("/{ride_id}/complete", response_model=RideOut)
def complete_ride(
    ride_id: str,
    current_user: CurrentUser = Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    ride = _get_ride_or_404(db, ride_id)

    if ride.driver_id != current_user.uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ride")
    if ride.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride cannot be completed from its current status",
        )

    ride.status = "completed"
    ride.final_fare = ride.fare_estimate
    ride.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ride)
    _push_ride(ride)
    return _ride_to_out(ride)


# --- In-ride chat -----------------------------------------------------

@router.get("/{ride_id}/messages")
def get_ride_messages(
    ride_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ride = _get_ride_or_404(db, ride_id)
    _ensure_participant(ride, current_user)
    messages = (
        db.query(RideMessage)
        .filter(RideMessage.ride_id == ride_id)
        .order_by(RideMessage.at.asc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "sender_name": m.sender_name,
            "text": m.text,
            "at": m.at.isoformat(),
        }
        for m in messages
    ]


@router.post(
    "/{ride_id}/messages",
    dependencies=[Depends(rate_limit("rides.chat", max_calls=30, window_seconds=60))],
)
def send_ride_message(
    ride_id: str,
    payload: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ride = _get_ride_or_404(db, ride_id)
    _ensure_participant(ride, current_user)

    text = (payload.get("text") or "").strip()[:500]
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message text is required")

    sender_name = _get_user_name(db, current_user.uid) or "User"
    message = RideMessage(
        ride_id=ride_id,
        sender_id=current_user.uid,
        sender_name=sender_name,
        text=text,
        at=datetime.now(timezone.utc),
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    payload_out = {
        "id": message.id,
        "sender_id": message.sender_id,
        "sender_name": message.sender_name,
        "text": message.text,
        "at": message.at.isoformat(),
    }
    manager.broadcast(
        f"ride_chat:{ride_id}", {"topic": f"ride_chat:{ride_id}", "type": "message", "data": payload_out}
    )
    return payload_out
