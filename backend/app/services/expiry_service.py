import asyncio
import logging
from datetime import datetime, timedelta, timezone

from firebase_admin import firestore

from app.core.firebase import get_firestore_client

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 30

# How far before the pickup time a scheduled ride is broadcast to drivers.
SCHEDULE_BROADCAST_LEAD = timedelta(minutes=5)


def promote_due_scheduled_rides() -> int:
    """Broadcast scheduled rides whose pickup time is (almost) here."""
    from app.api.v1.rides import broadcast_ride_request

    db = get_firestore_client()
    due_before = datetime.now(timezone.utc) + SCHEDULE_BROADCAST_LEAD
    promoted = 0

    for doc in db.collection("rides").where("status", "==", "scheduled").stream():
        data = doc.to_dict()
        scheduled_at = data.get("scheduledAt")
        if not scheduled_at or scheduled_at > due_before:
            continue
        doc.reference.update({"status": "requested"})
        data["status"] = "requested"
        broadcast_ride_request(db, doc.id, data)
        promoted += 1

    return promoted


def expire_stale_requests() -> int:
    """Cancel rides whose broadcast request passed its expiresAt with no driver.

    Runs in a thread (Firestore admin client is sync); returns how many expired.
    """
    db = get_firestore_client()
    now = datetime.now(timezone.utc)
    expired = 0

    for doc in (
        db.collection("ride_requests").where("expiresAt", "<", now).stream()
    ):
        data = doc.to_dict()
        if data.get("status") != "pending":
            continue

        ride_ref = db.collection("rides").document(doc.id)
        ride = ride_ref.get()
        # Only cancel if the ride is still waiting; a concurrent accept wins.
        if ride.exists and ride.to_dict().get("status") == "requested":
            ride_ref.update(
                {
                    "status": "cancelled",
                    "cancelReason": "No drivers available - request timed out",
                    "cancellationFee": 0.0,
                    "cancelledAt": firestore.SERVER_TIMESTAMP,
                }
            )
        doc.reference.update({"status": "expired"})
        expired += 1

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
