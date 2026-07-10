import pytest
from fastapi import HTTPException

from app.core.rate_limit import _hits, rate_limit
from app.core.security import CurrentUser


def make_user(uid="u1"):
    return CurrentUser(uid=uid, email=None, role="passenger")


def test_allows_up_to_max_calls_then_blocks():
    bucket = "test.bucket.a"
    dep = rate_limit(bucket, max_calls=3, window_seconds=60)

    # rate_limit() returns a FastAPI dependency function; passing
    # current_user positionally bypasses its Depends(...) default.
    for _ in range(3):
        dep(make_user())

    with pytest.raises(HTTPException) as exc_info:
        dep(make_user())
    assert exc_info.value.status_code == 429


def test_buckets_are_independent_per_user():
    bucket = "test.bucket.b"
    dep = rate_limit(bucket, max_calls=1, window_seconds=60)

    dep(make_user("driver-a"))
    dep(make_user("driver-b"))  # different uid, should not be blocked

    with pytest.raises(HTTPException):
        dep(make_user("driver-a"))


def test_window_resets_after_expiry(monkeypatch):
    bucket = "test.bucket.c"
    dep = rate_limit(bucket, max_calls=1, window_seconds=10)
    user = make_user("driver-c")

    import app.core.rate_limit as rl_module

    t = [1000.0]
    monkeypatch.setattr(rl_module.time, "monotonic", lambda: t[0])

    dep(user)
    with pytest.raises(HTTPException):
        dep(user)

    t[0] += 11  # past the window
    dep(user)  # should succeed again
