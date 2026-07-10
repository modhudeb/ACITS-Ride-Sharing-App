from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    custom_token: str


class FareRules(BaseModel):
    base_fare: float = Field(ge=0)
    per_km_rate: float = Field(ge=0)
    per_min_rate: float = Field(ge=0)
    booking_fee: float = Field(ge=0)
    minimum_fare: float = Field(ge=0)
    per_kg_rate: float = Field(ge=0)
    per_m3_rate: float = Field(ge=0)
    pool_discount_pct: float = Field(ge=0, le=90)
    peak_hour_multiplier: float = Field(ge=1, le=5)
    night_multiplier: float = Field(ge=1, le=5)
    surge_enabled: bool
    surge_cap: float = Field(ge=1, le=5)
    cancellation_fee: float = Field(ge=0)
    cancellation_free_window_sec: int = Field(ge=0)


class DashboardStats(BaseModel):
    total_passengers: int
    total_drivers: int
    pending_drivers: int
    online_drivers: int
    total_rides: int
    completed_rides: int
    rides_today: int
    total_revenue: float
