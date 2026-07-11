"""SQLAlchemy models - the Postgres equivalent of the old Firestore
collections (users, driver_profiles, rides, ride_requests, ratings,
rides/{id}/messages, fare_rules/config). Column names are snake_case
(Postgres convention) where the Firestore docs used camelCase; the API layer
maps between them the same way it already mapped Firestore field names to
the Pydantic *Out models.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    uid: Mapped[str] = mapped_column(String(128), primary_key=True)
    role: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, unique=True, index=True)
    # Nullable so the admin row (whose credential check is against
    # ADMIN_USERNAME/ADMIN_PASSWORD env vars, never a stored hash) doesn't
    # need one - see admin_login.
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active", server_default="active")
    # Populated when a driver rates this user after a completed ride (drivers
    # are rated on driver_profiles instead - see DriverProfile.rating_avg).
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    rating_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DriverProfile(Base):
    __tablename__ = "driver_profiles"

    uid: Mapped[str] = mapped_column(
        String(128), ForeignKey("users.uid"), primary_key=True
    )
    vehicle_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vehicle_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    plate_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    max_passengers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_volume_m3: Mapped[float | None] = mapped_column(Float, nullable=True)
    online_status: Mapped[str] = mapped_column(
        String(20), default="offline", server_default="offline"
    )
    current_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    geohash: Mapped[str | None] = mapped_column(String(12), nullable=True, index=True)
    location_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    rating_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    @property
    def capacity(self) -> dict | None:
        """Mirrors the old Firestore `capacity` sub-object shape, so
        capacity_service (unchanged) and callers that used to do
        profile_data.get("capacity") keep working unmodified."""
        if self.max_passengers is None:
            return None
        return {
            "maxPassengers": self.max_passengers,
            "maxWeightKg": self.max_weight_kg or 0,
            "maxVolumeM3": self.max_volume_m3 or 0,
        }


class Ride(Base):
    __tablename__ = "rides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    passenger_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("users.uid"), index=True
    )
    passenger_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    driver_id: Mapped[str | None] = mapped_column(
        String(128), ForeignKey("users.uid"), nullable=True, index=True
    )
    driver_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), index=True)

    pickup_lat: Mapped[float] = mapped_column(Float)
    pickup_lng: Mapped[float] = mapped_column(Float)
    pickup_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    destination_lat: Mapped[float] = mapped_column(Float)
    destination_lng: Mapped[float] = mapped_column(Float)
    destination_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    distance_meters: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    route_path: Mapped[list] = mapped_column(JSON, default=list)
    fare_estimate: Mapped[float] = mapped_column(Float)
    fare_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)

    goods_weight_kg: Mapped[float] = mapped_column(Float, default=0, server_default="0")
    goods_volume_m3: Mapped[float] = mapped_column(Float, default=0, server_default="0")
    goods_description: Mapped[str | None] = mapped_column(String(200), nullable=True)

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Present only while a scheduled ride waits to be broadcast - see
    # expiry_service.promote_due_scheduled_rides. Indexed since the sweeper
    # range-scans it every 30s.
    schedule_broadcast_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    final_fare: Mapped[float | None] = mapped_column(Float, nullable=True)
    cancellation_fee: Mapped[float | None] = mapped_column(Float, nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    share_token: Mapped[str] = mapped_column(String(64))

    rated_by_passenger: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    rated_by_driver: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    request = relationship("RideRequest", back_populates="ride", uselist=False)


class RideRequest(Base):
    """The broadcast doc online drivers listen to - a live projection of a
    `requested`-status ride. Deleted the moment the ride stops being
    broadcastable (accepted/cancelled/expired) so it never lingers."""

    __tablename__ = "ride_requests"

    ride_id: Mapped[str] = mapped_column(String(36), ForeignKey("rides.id"), primary_key=True)
    passenger_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pickup: Mapped[dict] = mapped_column(JSON)
    destination: Mapped[dict] = mapped_column(JSON)
    goods: Mapped[dict] = mapped_column(JSON, default=dict)
    distance_meters: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    fare_estimate: Mapped[float] = mapped_column(Float)
    geohash: Mapped[str] = mapped_column(String(12), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    declined_by: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    ride = relationship("Ride", back_populates="request")


class Rating(Base):
    __tablename__ = "ratings"

    ride_id: Mapped[str] = mapped_column(String(36), ForeignKey("rides.id"), primary_key=True)
    passenger_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    driver_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    by_passenger: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    by_driver: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class RideMessage(Base):
    __tablename__ = "ride_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ride_id: Mapped[str] = mapped_column(String(36), ForeignKey("rides.id"), index=True)
    sender_id: Mapped[str] = mapped_column(String(128))
    sender_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    text: Mapped[str] = mapped_column(String(500))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FareRules(Base):
    """Singleton row (id=1) - the Postgres equivalent of the
    fare_rules/config Firestore doc."""

    __tablename__ = "fare_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    base_fare: Mapped[float] = mapped_column(Float)
    per_km_rate: Mapped[float] = mapped_column(Float)
    per_min_rate: Mapped[float] = mapped_column(Float)
    booking_fee: Mapped[float] = mapped_column(Float)
    minimum_fare: Mapped[float] = mapped_column(Float)
    per_kg_rate: Mapped[float] = mapped_column(Float)
    per_m3_rate: Mapped[float] = mapped_column(Float)
    pool_discount_pct: Mapped[float] = mapped_column(Float)
    peak_hour_multiplier: Mapped[float] = mapped_column(Float)
    night_multiplier: Mapped[float] = mapped_column(Float)
    surge_enabled: Mapped[bool] = mapped_column(Boolean)
    surge_cap: Mapped[float] = mapped_column(Float)
    cancellation_fee: Mapped[float] = mapped_column(Float)
    cancellation_free_window_sec: Mapped[int] = mapped_column(Integer)
    peak_hours: Mapped[list] = mapped_column(JSON)
    night_hours: Mapped[list] = mapped_column(JSON)


class PasswordResetToken(Base):
    """A forgot-password link is only as safe as the token in it, so only a
    hash is ever stored here - same principle as User.password_hash. The raw
    token exists only in the emailed link and the request that redeems it."""

    __tablename__ = "password_reset_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    uid: Mapped[str] = mapped_column(String(128), ForeignKey("users.uid"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
