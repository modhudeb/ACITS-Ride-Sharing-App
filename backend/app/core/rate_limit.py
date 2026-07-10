import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status

from app.core.security import CurrentUser, get_current_user

# Simple in-memory sliding-window limiter, keyed per user per named bucket.
# Single-process only - fine for this project's scale; a multi-instance
# deployment would need a shared store (e.g. Redis) instead.
_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def rate_limit(bucket: str, max_calls: int, window_seconds: float):
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        key = (bucket, current_user.uid)
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
        return current_user

    return dependency


def rate_limit_by_ip(bucket: str, max_calls: int, window_seconds: float):
    """Same sliding-window limiter, keyed by client IP for endpoints that
    have no authenticated user (e.g. the public share-my-trip lookup)."""

    def dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        key = (bucket, client_ip)
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

    return dependency
