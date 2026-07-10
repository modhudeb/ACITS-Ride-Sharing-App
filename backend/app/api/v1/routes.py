from fastapi import APIRouter, Depends

from app.core.rate_limit import rate_limit
from app.core.security import CurrentUser, get_current_user
from app.models.ride import (
    EtaRequest,
    EtaResponse,
    FareBreakdown,
    RouteEstimateRequest,
    RouteEstimateResponse,
)
from app.services import fare_service, maps_service, surge_service

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/estimate", response_model=RouteEstimateResponse)
async def estimate_route(
    payload: RouteEstimateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(rate_limit("routes.estimate", max_calls=20, window_seconds=60)),
):
    route = await maps_service.compute_route(payload.pickup, payload.destination)

    rules = fare_service.get_fare_rules()
    surge = surge_service.compute_surge(payload.pickup.lat, payload.pickup.lng, rules=rules)
    fare = fare_service.calculate_fare(
        route["distance_meters"],
        route["duration_seconds"],
        goods_weight_kg=payload.goods.weight_kg,
        goods_volume_m3=payload.goods.volume_m3,
        surge_multiplier=surge,
        # No `at=` - fare_service defaults to now() in Asia/Dhaka time, which
        # is what the peak/night windows are actually defined against.
        rules=rules,
    )

    return RouteEstimateResponse(
        distance_meters=route["distance_meters"],
        duration_seconds=route["duration_seconds"],
        route_path=route["route_path"],
        fare_estimate=fare["total"],
        fare_breakdown=FareBreakdown(**fare),
    )


@router.post("/eta", response_model=EtaResponse)
async def get_eta(
    payload: EtaRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(rate_limit("routes.eta", max_calls=20, window_seconds=60)),
):
    """Road-based distance/duration between two points - used to show a live
    'driver is ~7 min away' figure. No fare math here, just the raw route.
    """
    route = await maps_service.compute_route(payload.origin, payload.destination)
    return EtaResponse(
        distance_meters=route["distance_meters"],
        duration_seconds=route["duration_seconds"],
    )
