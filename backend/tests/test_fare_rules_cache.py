"""The fare-rules cache exists purely to save Firestore reads, so the thing
worth locking in is exactly when it does and doesn't hit Firestore."""

import pytest

from app.services import fare_service


class FakeDoc:
    def __init__(self, data):
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return self._data


class FakeFirestore:
    """Counts config-doc reads; the chained collection/document calls mirror
    how get_fare_rules actually reaches the doc."""

    def __init__(self, data):
        self.reads = 0
        self._data = data

    def collection(self, name):
        return self

    def document(self, name):
        return self

    def get(self):
        self.reads += 1
        return FakeDoc(self._data)


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeFirestore({"baseFare": 55.0})
    monkeypatch.setattr(fare_service, "get_firestore_client", lambda: db)
    fare_service.invalidate_fare_rules_cache()
    yield db
    fare_service.invalidate_fare_rules_cache()


def test_second_call_within_ttl_reads_from_cache(fake_db):
    first = fare_service.get_fare_rules()
    second = fare_service.get_fare_rules()
    assert fake_db.reads == 1
    assert first == second
    assert first["baseFare"] == 55.0  # Firestore value overrides the default


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
