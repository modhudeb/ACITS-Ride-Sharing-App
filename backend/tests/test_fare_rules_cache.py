"""The fare-rules cache exists purely to save a database round trip per
estimate, so the thing worth locking in is exactly when it does and doesn't
hit the database. Runs against a real SQLite session (not a hand-rolled
fake) so it exercises the actual SQLAlchemy query path."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import FareRules
from app.db.session import Base
from app.services import fare_service


class ReadCountingSessionFactory:
    """Wraps a real sessionmaker and counts how many sessions get() a
    fare_rules row - i.e. how many times get_fare_rules actually hit the
    database instead of serving from its in-process cache."""

    def __init__(self, factory):
        self._factory = factory
        self.reads = 0

    def __call__(self):
        session = self._factory()
        original_get = session.get

        def counting_get(model, ident):
            if model is FareRules:
                self.reads += 1
            return original_get(model, ident)

        session.get = counting_get
        return session


@pytest.fixture
def fake_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine, tables=[FareRules.__table__])
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        session.add(
            FareRules(
                id=1,
                base_fare=55.0,
                per_km_rate=15.0,
                per_min_rate=2.0,
                booking_fee=20.0,
                minimum_fare=80.0,
                per_kg_rate=0.5,
                per_m3_rate=30.0,
                pool_discount_pct=20.0,
                peak_hour_multiplier=1.2,
                night_multiplier=1.15,
                surge_enabled=True,
                surge_cap=2.5,
                cancellation_fee=30.0,
                cancellation_free_window_sec=120,
                peak_hours=[[7, 10], [17, 20]],
                night_hours=[22, 6],
            )
        )
        session.commit()

    counting_factory = ReadCountingSessionFactory(factory)
    monkeypatch.setattr(fare_service, "get_session_factory", lambda: counting_factory)
    fare_service.invalidate_fare_rules_cache()
    yield counting_factory
    fare_service.invalidate_fare_rules_cache()
    engine.dispose()


def test_second_call_within_ttl_reads_from_cache(fake_db):
    first = fare_service.get_fare_rules()
    second = fare_service.get_fare_rules()
    assert fake_db.reads == 1
    assert first == second
    assert first["baseFare"] == 55.0  # database value overrides the default


def test_invalidate_forces_a_fresh_read(fake_db):
    fare_service.get_fare_rules()
    fare_service.invalidate_fare_rules_cache()
    fare_service.get_fare_rules()
    assert fake_db.reads == 2


def test_ttl_expiry_forces_a_fresh_read(fake_db, monkeypatch):
    fare_service.get_fare_rules()
    monkeypatch.setattr(
        fare_service,
        "_rules_cached_at",
        fare_service._rules_cached_at - fare_service._RULES_CACHE_TTL_SECONDS - 1,
    )
    fare_service.get_fare_rules()
    assert fake_db.reads == 2


def test_mutating_a_result_does_not_poison_the_cache(fake_db):
    rules = fare_service.get_fare_rules()
    rules["baseFare"] = 9999.0
    assert fare_service.get_fare_rules()["baseFare"] == 55.0
