"""Exercises the real rides.py endpoint functions directly against an
in-memory SQLite session - no FastAPI dependency injection, no network - so
the actual SQL queries, row-lock logic, and status-transition rules get
covered, not a reimplementation of them.
"""
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1 import rides as rides_module
from app.core.security import CurrentUser
from app.db.models import DriverProfile, Ride, RideRequest, User
from app.db.session import Base
from app.models.ride import Address, CancelRideRequest, FareBreakdown, Goods, RateRideRequest, RideCreateRequest
from app.services.fare_service import DEFAULT_FARE_RULES


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture(autouse=True)
def no_broadcast(monkeypatch):
    """manager.broadcast() no-ops when no event loop is bound (see
    core/realtime.py) - true here since these tests call endpoint functions
    directly rather than running the app - so nothing to mock; this fixture
    just documents that broadcasts are inert in this test file."""
    yield


@pytest.fixture
def mock_fare_and_maps(monkeypatch):
    """create_ride pulls fare rules/surge/route from services that (by
    design) manage their own DB sessions - point the fare/surge calls at
    fixed values instead of letting them hit the real configured database."""
    monkeypatch.setattr(rides_module.fare_service, "get_fare_rules", lambda: dict(DEFAULT_FARE_RULES))
    monkeypatch.setattr(rides_module.surge_service, "compute_surge", lambda *a, **k: 1.0)

    async def fake_compute_route(origin, destination):
        return {
            "distance_meters": 5000,
            "duration_seconds": 600,
            "route_path": [{"lat": origin.lat, "lng": origin.lng}, {"lat": destination.lat, "lng": destination.lng}],
        }

    monkeypatch.setattr(rides_module.maps_service, "compute_route", fake_compute_route)


def make_user(session, uid, role, name="Test", status="active"):
    user = User(uid=uid, role=role, name=name, email=f"{uid}@test.local", status=status, created_at=datetime.now(timezone.utc))
    session.add(user)
    session.commit()
    return user


def make_driver_profile(session, uid, **overrides):
    defaults = dict(
        vehicle_type="truck",
        max_passengers=2,
        max_weight_kg=1000.0,
        max_volume_m3=6.0,
        online_status="online",
    )
    defaults.update(overrides)
    profile = DriverProfile(uid=uid, **defaults)
    session.add(profile)
    session.commit()
    return profile


def make_ride(session, passenger_id, **overrides):
    defaults = dict(
        id=str(uuid.uuid4()),
        passenger_id=passenger_id,
        status="requested",
        pickup_lat=23.8,
        pickup_lng=90.4,
        pickup_address="Pickup",
        destination_lat=23.9,
        destination_lng=90.5,
        destination_address="Destination",
        distance_meters=5000,
        duration_seconds=600,
        route_path=[],
        fare_estimate=100.0,
        fare_breakdown={"base_fare": 40.0, "distance_fare": 30.0, "time_fare": 30.0, "total": 100.0},
        goods_weight_kg=0,
        goods_volume_m3=0,
        share_token="tok123",
        requested_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    ride = Ride(**defaults)
    session.add(ride)
    session.commit()
    return ride


def user_ctx(uid, role):
    return CurrentUser(uid=uid, email=None, role=role)


# --- create_ride --------------------------------------------------------

def _ride_create_payload():
    return RideCreateRequest(
        pickup=Address(lat=23.8, lng=90.4, address="A"),
        destination=Address(lat=23.9, lng=90.5, address="B"),
        distance_meters=1,
        duration_seconds=1,
        route_path=[],
        fare_estimate=1,
        fare_breakdown=FareBreakdown(base_fare=1, distance_fare=1, time_fare=1, total=1),
        goods=Goods(),
    )


def test_create_ride_broadcasts_a_pending_request(db_session, mock_fare_and_maps):
    make_user(db_session, "passenger1", "passenger")

    result = asyncio.run(
        rides_module.create_ride(
            _ride_create_payload(),
            current_user=user_ctx("passenger1", "passenger"),
            _=None,
            db=db_session,
        )
    )

    assert result.status == "requested"
    assert result.passenger_id == "passenger1"
    request_row = db_session.get(RideRequest, result.id)
    assert request_row is not None
    assert request_row.status == "pending"


def test_create_ride_rejects_a_second_active_ride(db_session, mock_fare_and_maps):
    make_user(db_session, "passenger1", "passenger")
    make_ride(db_session, "passenger1", status="requested")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            rides_module.create_ride(
                _ride_create_payload(),
                current_user=user_ctx("passenger1", "passenger"),
                _=None,
                db=db_session,
            )
        )
    assert exc.value.status_code == 409


# --- accept_ride ----------------------------------------------------------

def test_accept_ride_succeeds(db_session):
    make_user(db_session, "passenger1", "passenger")
    make_user(db_session, "driver1", "driver")
    make_driver_profile(db_session, "driver1")
    ride = make_ride(db_session, "passenger1")

    result = rides_module.accept_ride(
        ride.id, current_user=user_ctx("driver1", "driver"), _=None, db=db_session
    )

    assert result.status == "accepted"
    assert result.driver_id == "driver1"
    assert db_session.get(Ride, ride.id).status == "accepted"
    assert db_session.get(RideRequest, ride.id) is None  # broadcast row cleaned up


def test_accept_ride_rejects_offline_driver(db_session):
    make_user(db_session, "passenger1", "passenger")
    make_user(db_session, "driver1", "driver")
    make_driver_profile(db_session, "driver1", online_status="offline")
    ride = make_ride(db_session, "passenger1")

    with pytest.raises(HTTPException) as exc:
        rides_module.accept_ride(ride.id, current_user=user_ctx("driver1", "driver"), _=None, db=db_session)
    assert exc.value.status_code == 400


def test_accept_ride_rejects_already_taken_ride(db_session):
    make_user(db_session, "passenger1", "passenger")
    make_user(db_session, "driver1", "driver")
    make_driver_profile(db_session, "driver1")
    ride = make_ride(db_session, "passenger1", status="accepted", driver_id="someone-else")

    with pytest.raises(HTTPException) as exc:
        rides_module.accept_ride(ride.id, current_user=user_ctx("driver1", "driver"), _=None, db=db_session)
    assert exc.value.status_code == 409


def test_accept_ride_rejects_over_capacity(db_session):
    make_user(db_session, "passenger1", "passenger")
    make_user(db_session, "passenger2", "passenger")
    make_user(db_session, "driver1", "driver")
    make_driver_profile(db_session, "driver1", max_passengers=1)
    make_ride(db_session, "passenger1", status="accepted", driver_id="driver1")
    ride = make_ride(db_session, "passenger2")

    with pytest.raises(HTTPException) as exc:
        rides_module.accept_ride(ride.id, current_user=user_ctx("driver1", "driver"), _=None, db=db_session)
    assert exc.value.status_code == 409
    assert "seat" in exc.value.detail.lower()


# --- cancel_ride ------------------------------------------------------------

def test_cancel_ride_before_accept_has_no_fee(db_session):
    make_user(db_session, "passenger1", "passenger")
    ride = make_ride(db_session, "passenger1", status="requested")

    result = rides_module.cancel_ride(
        ride.id,
        CancelRideRequest(reason="changed my mind"),
        current_user=user_ctx("passenger1", "passenger"),
        db=db_session,
    )
    assert result.status == "cancelled"
    assert result.cancellation_fee == 0.0


def test_cancel_ride_by_non_participant_forbidden(db_session):
    make_user(db_session, "passenger1", "passenger")
    ride = make_ride(db_session, "passenger1", status="requested")

    with pytest.raises(HTTPException) as exc:
        rides_module.cancel_ride(
            ride.id,
            CancelRideRequest(reason="nope"),
            current_user=user_ctx("someone-else", "passenger"),
            db=db_session,
        )
    assert exc.value.status_code == 403


# --- start_ride / complete_ride --------------------------------------------

def test_start_then_complete_ride(db_session):
    make_user(db_session, "passenger1", "passenger")
    ride = make_ride(db_session, "passenger1", status="accepted", driver_id="driver1", fare_estimate=250.0)

    started = rides_module.start_ride(ride.id, current_user=user_ctx("driver1", "driver"), db=db_session)
    assert started.status == "in_progress"

    completed = rides_module.complete_ride(ride.id, current_user=user_ctx("driver1", "driver"), db=db_session)
    assert completed.status == "completed"
    assert completed.final_fare == 250.0


def test_complete_ride_wrong_driver_forbidden(db_session):
    ride = make_ride(db_session, "passenger1", status="in_progress", driver_id="driver1")

    with pytest.raises(HTTPException) as exc:
        rides_module.complete_ride(ride.id, current_user=user_ctx("driver2", "driver"), db=db_session)
    assert exc.value.status_code == 403


# --- rate_ride: the transaction this replaced was specifically about -------
# preventing a double-submit from being counted twice.

def test_rate_ride_updates_driver_rating_average(db_session):
    make_driver_profile(db_session, "driver1", rating_avg=4.0, rating_count=1)
    ride = make_ride(db_session, "passenger1", status="completed", driver_id="driver1")

    rides_module.rate_ride(
        ride.id,
        RateRideRequest(rating=5, comment="Great ride"),
        current_user=user_ctx("passenger1", "passenger"),
        _=None,
        db=db_session,
    )

    profile = db_session.get(DriverProfile, "driver1")
    assert profile.rating_count == 2
    assert profile.rating_avg == 4.5
    assert db_session.get(Ride, ride.id).rated_by_passenger is True


def test_rate_ride_twice_by_same_rater_rejected(db_session):
    ride = make_ride(db_session, "passenger1", status="completed", driver_id="driver1")
    make_driver_profile(db_session, "driver1")

    rides_module.rate_ride(
        ride.id, RateRideRequest(rating=5), current_user=user_ctx("passenger1", "passenger"), _=None, db=db_session
    )
    with pytest.raises(HTTPException) as exc:
        rides_module.rate_ride(
            ride.id, RateRideRequest(rating=1), current_user=user_ctx("passenger1", "passenger"), _=None, db=db_session
        )
    assert exc.value.status_code == 409


def test_rate_ride_before_completion_rejected(db_session):
    ride = make_ride(db_session, "passenger1", status="in_progress", driver_id="driver1")

    with pytest.raises(HTTPException) as exc:
        rides_module.rate_ride(
            ride.id, RateRideRequest(rating=5), current_user=user_ctx("passenger1", "passenger"), _=None, db=db_session
        )
    assert exc.value.status_code == 409
