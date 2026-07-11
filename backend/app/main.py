import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.realtime import manager
from app.services.expiry_service import run_expiry_sweeper

# uvicorn configures its own "uvicorn"/"uvicorn.access" loggers, but leaves
# the root logger at its default WARNING level - without this, every
# logger.info() in the app's own code (sweep results, the password-reset
# link fallback when SMTP isn't configured, Mapbox failure detail) is
# silently swallowed instead of reaching the console.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Sync endpoint code runs in a threadpool worker, not this event loop, so
    # ConnectionManager.broadcast() needs a reference to hand work back to it.
    manager.bind_loop(asyncio.get_running_loop())
    stop_event = asyncio.Event()
    sweeper = asyncio.create_task(run_expiry_sweeper(stop_event))
    yield
    stop_event.set()
    await sweeper


app = FastAPI(title="Ride Share API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
