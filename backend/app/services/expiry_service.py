import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.db.models import Ride, RideRequest
from app.db.session import get_session_factory

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 30

# How far before the pickup time a scheduled ride is broadcast to drivers.
SCHEDULE_BROADCAST_LEAD = timedelta(minutes=5)


def promote_due_scheduled_rides() -> int:
    """Broadcast scheduled rides whose pickup time is (almost) here.

    Queries on schedule_broadcast_at - a column that's set only while a ride
    is waiting to be broadcast and cleared the moment it's promoted (or found
    stale) - so this only ever touches rides that just became due, not every
    not-yet-due scheduled ride on every sweep. Doesn't matter for Postgres
    billing the way it did for Firestore reads, but it keeps this an
    index-backed query returning a handful of rows instead of a growing scan.
    """
    from app.api.v1.rides import _push_driver_feed, _push_ride, broadcast_ride_request

    now = datetime.now(timezone.utc)
    promoted = 0

    with get_session_factory()() as session:
        due = session.query(Ride).filter(Ride.schedule_broadcast_at <= now).with_for_update().all()
        for ride in due:
            if ride.status != "scheduled":
                # Cancelled (or otherwise moved on) before its broadcast time.
                ride.schedule_broadcast_at = None
                continue
            ride.status = "requested"
            ride.schedule_broadcast_at = None
            broadcast_ride_request(session, ride)
            promoted += 1

        session.commit()
        for ride in due:
            if ride.status == "requested":
                _push_ride(ride)
        if promoted:
            _push_driver_feed()

    return promoted


def expire_stale_requests() -> int:
    """Cancel rides whose broadcast request passed its expires_at with no
    driver. Runs in a thread (the session is sync); returns how many expired.
    """
    from app.api.v1.rides import _push_driver_feed, _push_ride

    now = datetime.now(timezone.utc)
    expired = 0
    rides_to_push: list[Ride] = []

    with get_session_factory()() as session:
        stale = (
            session.query(RideRequest).filter(RideRequest.expires_at < now).with_for_update().all()
        )
        for request in stale:
            if request.status != "pending":
                session.delete(request)
                continue

            ride = session.get(Ride, request.ride_id)
            # Only cancel if the ride is still waiting; a concurrent accept wins.
            if ride and ride.status == "requested":
                ride.status = "cancelled"
                ride.cancel_reason = "No drivers available - request timed out"
                ride.cancellation_fee = 0.0
                ride.cancelled_at = now
                rides_to_push.append(ride)
            session.delete(request)
            expired += 1

        session.commit()
        for ride in rides_to_push:
            _push_ride(ride)
        if expired:
            _push_driver_feed()

    return expired


async def run_expiry_sweeper(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            expired = await asyncio.to_thread(expire_stale_requests)
            if expired:
                logger.info("Expired %d stale ride request(s)", expired)
        except Exception:
            logger.exception("Ride request expiry sweep failed")
        try:
            promoted = await asyncio.to_thread(promote_due_scheduled_rides)
            if promoted:
                logger.info("Broadcast %d scheduled ride(s)", promoted)
        except Exception:
            logger.exception("Scheduled ride promotion sweep failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=SWEEP_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass
