"""Single WebSocket endpoint fronting every realtime topic (see
app/core/realtime.py for the topic list and push-vs-signal design). A
browser WebSocket connection can't set an Authorization header, so the JWT
travels as a query param instead - same trust level as a bearer token, just
a different transport.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from app.core.realtime import manager
from app.core.security import CurrentUser, resolve_current_user
from app.db.models import Ride
from app.db.session import get_session_factory

router = APIRouter(tags=["realtime"])


def _authorize(topic: str, user: CurrentUser) -> bool:
    if user.role == "admin":
        return True

    prefix, _, rest = topic.partition(":")

    if prefix in ("user", "rides"):
        return rest == user.uid
    if prefix in ("ride", "ride_chat"):
        with get_session_factory()() as session:
            ride = session.get(Ride, rest)
            return bool(ride) and user.uid in (ride.passenger_id, ride.driver_id)
    if topic == "driver_feed":
        return user.role == "driver"
    if topic == "driver_locations":
        return True
    if prefix == "driver_profile":
        return True
    if topic == "admin_ops":
        return False

    return False


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    try:
        user = resolve_current_user(token)
    except Exception:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    subscribed: set[str] = set()

    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")
            topic = message.get("topic")
            if not topic or action not in ("subscribe", "unsubscribe"):
                continue

            if action == "subscribe":
                if not _authorize(topic, user):
                    await websocket.send_json(
                        {"type": "error", "topic": topic, "detail": "Not authorized"}
                    )
                    continue
                manager.subscribe(topic, websocket)
                subscribed.add(topic)
            else:
                manager.unsubscribe(topic, websocket)
                subscribed.discard(topic)
    except WebSocketDisconnect:
        pass
    finally:
        manager.unsubscribe_all(websocket)
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
