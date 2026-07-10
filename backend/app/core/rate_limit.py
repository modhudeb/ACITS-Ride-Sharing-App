import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status

from app.core.security import CurrentUser, get_current_user

# Simple in-memory sliding-window limiter, keyed per user (or IP) per named
# bucket. Single-process only - fine for this project's scale; a
# multi-instance deployment would need a shared store (e.g. Redis) instead.
_hits: dict[tuple[str, str], deque] = defaultdict(deque)

# Every key ever seen gets a permanent dict entry that trimming alone never
# removes (trimming only runs when that same key is hit again - an
# abandoned key's stale timestamps just sit there forever). Periodically
# sweeping keys idle longer than every current window (all <= 60s, so an
# hour is a safe margin) keeps _hits from growing for as long as the
# process runs.
_STALE_AFTER_SECONDS = 3600
_SWEEP_EVERY_CALLS = 500
_calls_since_sweep = 0


def _sweep_stale(now: float) -> None:
    stale_keys = [
        key
        for key, hits in _hits.items()
        if not hits or now - hits[-1] > _STALE_AFTER_SECONDS
    ]
    for key in stale_keys:
        del _hits[key]


def _record_hit(key: tuple[str, str], max_calls: int, window_seconds: float) -> None:
    global _calls_since_sweep

    now = time.monotonic()
    hits = _hits[key]

    while hits and now - hits[0] > window_seconds:
        hits.popleft()

    if len(hits) >= max_calls:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests - please slow down",
        )

    hits.append(now)

    _calls_since_sweep += 1
    if _calls_since_sweep >= _SWEEP_EVERY_CALLS:
        _calls_since_sweep = 0
        _sweep_stale(now)


def rate_limit(bucket: str, max_calls: int, window_seconds: float):
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        _record_hit((bucket, current_user.uid), max_calls, window_seconds)
        return current_user

    return dependency


def rate_limit_by_ip(bucket: str, max_calls: int, window_seconds: float):
    """Same sliding-window limiter, keyed by client IP for endpoints that
    have no authenticated user (e.g. the public share-my-trip lookup)."""

    def dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        _record_hit((bucket, client_ip), max_calls, window_seconds)

    return dependency
