from pydantic import BaseModel, Field, field_validator, model_validator

VEHICLE_TYPES = ("truck", "bike", "car")


class UserOut(BaseModel):
    uid: str
    name: str | None = None
    email: str | None = None
    role: str
    status: str


class UserStatusUpdate(BaseModel):
    status: str


class DriverOut(BaseModel):
    uid: str
    name: str | None = None
    email: str | None = None
    status: str


class DriverStatusUpdate(BaseModel):
    status: str


class DriverOnlineStatusRequest(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in ("online", "offline"):
            raise ValueError("status must be 'online' or 'offline'")
        return value


class DriverLocationRequest(BaseModel):
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


class VehicleSetupRequest(BaseModel):
    """Vehicle details a driver must register before going online. Only
    trucks carry pooled cargo (kg/m3 capacity) - bikes and cars are
    passenger-only, so those fields are ignored for those vehicle types."""

    vehicle_type: str
    vehicle_model: str = Field(min_length=1, max_length=100)
    plate_number: str = Field(min_length=1, max_length=30)
    max_passengers: int = Field(default=2, ge=1, le=6)
    max_weight_kg: float | None = Field(default=None, gt=0, le=5000)
    max_volume_m3: float | None = Field(default=None, gt=0, le=50)

    @field_validator("vehicle_type")
    @classmethod
    def validate_vehicle_type(cls, value: str) -> str:
        if value not in VEHICLE_TYPES:
            raise ValueError(f"vehicle_type must be one of {VEHICLE_TYPES}")
        return value

    @model_validator(mode="after")
    def validate_truck_capacity(self):
        if self.vehicle_type == "truck" and (
            self.max_weight_kg is None or self.max_volume_m3 is None
        ):
            raise ValueError(
                "max_weight_kg and max_volume_m3 are required for trucks"
            )
        return self


class VehicleOut(BaseModel):
    vehicle_type: str
    vehicle_model: str
    plate_number: str
    max_passengers: int
    max_weight_kg: float | None = None
    max_volume_m3: float | None = None


class EarningsSummary(BaseModel):
    today_total: float
    week_total: float
    all_time_total: float
    today_rides: int
    week_rides: int
    all_time_rides: int
