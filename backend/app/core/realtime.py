"""In-process WebSocket pub/sub - the Postgres-era replacement for Firestore's
onSnapshot listeners. Firestore pushed raw document state to the browser
directly; here the backend pushes small events instead;

- Single-object topics (a ride, a driver's location/profile, a chat message,
  a user's own profile) push the full new state, since that's cheap and lets
  the frontend hook just replace its state wholesale, mirroring how
  onSnapshot behaved.
- List-shaped topics (a driver's pending-request feed, "do I have an active
  ride") push a content-free signal instead of trying to stream deltas -
  the frontend hook reacts by refetching a small REST endpoint. Postgres has
  no per-read billing the way Firestore did, so refetch-on-signal is simply
  the least error-prone way to keep list state correct.

Runs as a single process's in-memory state - correct for one backend
instance (this project's whole deployment target), not for horizontally
scaled multi-instance deployments (which would need a shared broker like
Redis pub/sub instead).
"""

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._topics: dict[str, set[WebSocket]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Called once at app startup so broadcast() - invoked from sync
        endpoint code running in FastAPI's threadpool - can safely hand work
        back to the event loop that owns the actual WebSocket connections."""
        self._loop = loop

    def subscribe(self, topic: str, ws: WebSocket) -> None:
        self._topics[topic].add(ws)

    def unsubscribe(self, topic: str, ws: WebSocket) -> None:
        self._topics[topic].discard(ws)

    def unsubscribe_all(self, ws: WebSocket) -> None:
        for subscribers in self._topics.values():
            subscribers.discard(ws)

    async def _broadcast_async(self, topic: str, message: dict) -> None:
        dead = []
        for ws in list(self._topics.get(topic, ())):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._topics[topic].discard(ws)

    def broadcast(self, topic: str, message: dict) -> None:
        """Safe to call from anywhere - sync endpoint code in a threadpool
        worker, or async code already on the event loop."""
        if self._loop is None:
            logger.warning("broadcast(%s) called before the event loop was bound", topic)
            return
        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None

        if running_loop is self._loop:
            self._loop.create_task(self._broadcast_async(topic, message))
        else:
            asyncio.run_coroutine_threadsafe(
                self._broadcast_async(topic, message), self._loop
            )


manager = ConnectionManager()
