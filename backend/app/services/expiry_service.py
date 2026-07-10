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
    """Broadcast scheduled rides whose pickup time is (almost) here.

    Queries on scheduleBroadcastAt - a field that exists only while a ride is
    waiting to be broadcast and is deleted the moment it's promoted (or found
    stale). Querying status == "scheduled" instead would re-read every not-yet-
    due scheduled ride on every 30s sweep: a ride booked 7 days ahead would be
    billed ~20,000 reads before it ever ran. A single-field range on a
    self-cleaning field only ever matches docs that became due since the last
    sweep - same pattern expire_stale_requests uses on ride_requests.
    """
    from app.api.v1.rides import broadcast_ride_request

    db = get_firestore_client()
    now = datetime.now(timezone.utc)
    promoted = 0

    for doc in (
        db.collection("rides").where("scheduleBroadcastAt", "<=", now).stream()
    ):
        data = doc.to_dict()
        if data.get("status") != "scheduled":
            # Cancelled (or otherwise moved on) before its broadcast time -
            # drop the field so this doc never matches the sweep again.
            doc.reference.update({"scheduleBroadcastAt": firestore.DELETE_FIELD})
            continue
        doc.reference.update(
            {"status": "requested", "scheduleBroadcastAt": firestore.DELETE_FIELD}
        )
        data["status"] = "requested"
        broadcast_ride_request(db, doc.id, data)
        promoted += 1

    return promoted


def expire_stale_requests() -> int:
    """Cancel rides whose broadcast request passed its expiresAt with no driver.

    Runs in a thread (Firestore admin client is sync); returns how many expired.

    accept_ride/cancel_ride delete their ride_requests doc the instant it stops
    being live, so - barring a request that is still genuinely pending - this
    scan only ever finds docs that crossed expiresAt since the last sweep, not
    the collection's entire history. Deleting (rather than marking "expired")
    keeps it that way: a doc left behind with an old expiresAt would otherwise
    match this query forever and get re-read, and re-billed, every 30s.
    """
    db = get_firestore_client()
    now = datetime.now(timezone.utc)
    expired = 0

    for doc in (
        db.collection("ride_requests").where("expiresAt", "<", now).stream()
    ):
        data = doc.to_dict()
        if data.get("status") != "pending":
            doc.reference.delete()
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
        doc.reference.delete()
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
