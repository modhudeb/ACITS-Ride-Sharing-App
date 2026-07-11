from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class LatLng(BaseModel):
    lat: float
    lng: float

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, value: float) -> float:
        if not -90 <= value <= 90:
            raise ValueError("lat must be between -90 and 90")
        return value

    @field_validator("lng")
    @classmethod
    def validate_lng(cls, value: float) -> float:
        if not -180 <= value <= 180:
            raise ValueError("lng must be between -180 and 180")
        return value


class Goods(BaseModel):
    """Cargo an employee brings on a pooled truck ride. Zero values = riding without goods."""

    weight_kg: float = Field(default=0, ge=0, le=5000)
    volume_m3: float = Field(default=0, ge=0, le=50)
    description: str | None = Field(default=None, max_length=200)


class RouteEstimateRequest(BaseModel):
    pickup: LatLng
    destination: LatLng
    goods: Goods = Goods()


class FareBreakdown(BaseModel):
    base_fare: float
    distance_fare: float
    time_fare: float
    goods_surcharge: float = 0
    booking_fee: float = 0
    peak_hour_multiplier: float = 1.0
    night_multiplier: float = 1.0
    surge_multiplier: float = 1.0
    pool_discount_pct: float = 0
    minimum_fare_applied: bool = False
    total: float


class RouteEstimateResponse(BaseModel):
    distance_meters: int
    duration_seconds: int
    route_path: list[LatLng]
    fare_estimate: float
    fare_breakdown: FareBreakdown


class EtaRequest(BaseModel):
    origin: LatLng
    destination: LatLng


class EtaResponse(BaseModel):
    distance_meters: int
    duration_seconds: int


class Address(BaseModel):
    lat: float
    lng: float
    address: str | None = None


class RideCreateRequest(BaseModel):
    pickup: Address
    destination: Address
    # distance_meters/duration_seconds/route_path/fare_estimate/fare_breakdown
    # are accepted for backward compatibility with the frontend's optimistic
    # /routes/estimate preview, but the backend never trusts them for the
    # ride it actually creates - it recomputes route and fare itself from
    # pickup/destination/goods so a client can't forge a cheaper fare by
    # calling this endpoint directly with fabricated numbers.
    distance_meters: int = Field(ge=0)
    duration_seconds: int = Field(ge=0)
    route_path: list[LatLng]
    fare_estimate: float = Field(ge=0)
    fare_breakdown: FareBreakdown
    goods: Goods = Goods()
    scheduled_at: datetime | None = None


class CancelRideRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class RateRideRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class RideOut(BaseModel):
    id: str
    passenger_id: str
    passenger_name: str | None = None
    driver_id: str | None = None
    driver_name: str | None = None
    status: str
    pickup: Address
    destination: Address
    distance_meters: int
    duration_seconds: int
    route_path: list[LatLng]
    fare_estimate: float
    fare_breakdown: FareBreakdown
    goods: Goods = Goods()
    scheduled_at: datetime | None = None
    final_fare: float | None = None
    cancellation_fee: float | None = None
    cancel_reason: str | None = None
    share_token: str
    rated_by_passenger: bool = False
    rated_by_driver: bool = False


class RideHistoryItem(BaseModel):
    id: str
    role: str
    counterparty_name: str | None = None
    status: str
    pickup: Address
    destination: Address
    distance_meters: int
    duration_seconds: int
    fare_estimate: float
    goods: Goods = Goods()
    final_fare: float | None = None
    cancellation_fee: float | None = None
    cancel_reason: str | None = None
    rated_by_me: bool = False
    requested_at: str | None = None
    completed_at: str | None = None
