"""ConnectionManager (pub/sub) and the WS endpoint's topic authorization -
the Postgres-era replacement for Firestore's onSnapshot security rules."""
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.ws import _authorize
from app.core.realtime import ConnectionManager
from app.core.security import CurrentUser
from app.db.models import Ride
from app.db.session import Base


class FakeWebSocket:
    def __init__(self):
        self.sent = []
        self.fail = False

    async def send_json(self, message):
        if self.fail:
            raise RuntimeError("connection closed")
        self.sent.append(message)


def test_broadcast_delivers_only_to_subscribed_topic():
    async def body():
        manager = ConnectionManager()
        manager.bind_loop(asyncio.get_running_loop())
        ws_a, ws_b = FakeWebSocket(), FakeWebSocket()
        manager.subscribe("ride:1", ws_a)
        manager.subscribe("ride:2", ws_b)

        manager.broadcast("ride:1", {"topic": "ride:1", "type": "state"})
        await asyncio.sleep(0)  # let the scheduled task run

        assert ws_a.sent == [{"topic": "ride:1", "type": "state"}]
        assert ws_b.sent == []

    asyncio.run(body())


def test_unsubscribe_stops_delivery():
    async def body():
        manager = ConnectionManager()
        manager.bind_loop(asyncio.get_running_loop())
        ws = FakeWebSocket()
        manager.subscribe("driver_feed", ws)
        manager.unsubscribe("driver_feed", ws)

        manager.broadcast("driver_feed", {"topic": "driver_feed", "type": "signal"})
        await asyncio.sleep(0)

        assert ws.sent == []

    asyncio.run(body())


def test_dead_connection_is_pruned_on_broadcast():
    async def body():
        manager = ConnectionManager()
        manager.bind_loop(asyncio.get_running_loop())
        ws = FakeWebSocket()
        ws.fail = True
        manager.subscribe("admin_ops", ws)

        manager.broadcast("admin_ops", {"topic": "admin_ops", "type": "signal"})
        await asyncio.sleep(0)

        assert ws not in manager._topics["admin_ops"]

    asyncio.run(body())


def test_broadcast_before_loop_bound_does_not_raise():
    manager = ConnectionManager()
    ws = FakeWebSocket()
    manager.subscribe("ride:1", ws)
    manager.broadcast("ride:1", {"topic": "ride:1"})  # no loop bound - must no-op, not crash


# --- topic authorization ---------------------------------------------------

@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture(autouse=True)
def use_test_session_factory(monkeypatch, db_session):
    """_authorize opens its own short session (see api/v1/ws.py) - point it
    at the test database instead of whatever DATABASE_URL is configured."""
    import app.api.v1.ws as ws_module

    monkeypatch.setattr(ws_module, "get_session_factory", lambda: (lambda: db_session))


def test_admin_may_subscribe_to_anything(db_session):
    admin = CurrentUser(uid="admin1", email=None, role="admin")
    assert _authorize("user:someone-else", admin)
    assert _authorize("admin_ops", admin)
    assert _authorize("ride:nonexistent", admin)


def test_user_topic_is_self_only():
    passenger = CurrentUser(uid="p1", email=None, role="passenger")
    assert _authorize("user:p1", passenger)
    assert not _authorize("user:someone-else", passenger)


def test_ride_topic_requires_participation(db_session):
    ride_id = str(uuid.uuid4())
    db_session.add(
        Ride(
            id=ride_id,
            passenger_id="p1",
            driver_id="d1",
            status="accepted",
            pickup_lat=0, pickup_lng=0, destination_lat=0, destination_lng=0,
            distance_meters=1, duration_seconds=1, route_path=[],
            fare_estimate=1, fare_breakdown={},
            share_token="tok", requested_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    assert _authorize(f"ride:{ride_id}", CurrentUser(uid="p1", email=None, role="passenger"))
    assert _authorize(f"ride:{ride_id}", CurrentUser(uid="d1", email=None, role="driver"))
    assert not _authorize(f"ride:{ride_id}", CurrentUser(uid="stranger", email=None, role="passenger"))


def test_driver_feed_requires_driver_role():
    assert _authorize("driver_feed", CurrentUser(uid="d1", email=None, role="driver"))
    assert not _authorize("driver_feed", CurrentUser(uid="p1", email=None, role="passenger"))


def test_admin_ops_denied_to_non_admin():
    assert not _authorize("admin_ops", CurrentUser(uid="d1", email=None, role="driver"))


def test_driver_locations_open_to_any_signed_in_user():
    assert _authorize("driver_locations", CurrentUser(uid="p1", email=None, role="passenger"))
