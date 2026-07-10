import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.services.expiry_service import run_expiry_sweeper

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
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
