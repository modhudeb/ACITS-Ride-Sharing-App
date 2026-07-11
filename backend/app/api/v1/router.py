from fastapi import APIRouter

from app.api.v1 import admin, assistant, auth, drivers, health, rides, routes, users, ws

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(routes.router)
api_router.include_router(admin.router)
api_router.include_router(rides.router)
api_router.include_router(drivers.router)
api_router.include_router(assistant.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(ws.router)
