from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.models import DriverProfile, Ride, User
from app.db.session import get_db

router = APIRouter(prefix="/users", tags=["users"])


class VehicleOut(BaseModel):
    type: str | None
    model: str | None
    plate: str | None


class UserProfileOut(BaseModel):
    uid: str
    role: str | None
    name: str | None
    email: str | None
    status: str
    created_at: datetime
    rating_avg: float
    rating_count: int
    completed_rides: int
    vehicle: VehicleOut | None = None


@router.get("/me", response_model=UserProfileOut)
def get_my_profile(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.get(User, current_user.uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    # Passengers are rated by drivers and store it on User; drivers are rated
    # by passengers and store it on DriverProfile instead (see db/models.py) -
    # so the "real" rating for a driver lives on the profile row, not User.
    rating_avg = user.rating_avg
    rating_count = user.rating_count
    vehicle = None
    if user.role == "driver":
        profile = db.get(DriverProfile, user.uid)
        if profile:
            rating_avg = profile.rating_avg
            rating_count = profile.rating_count
            if profile.vehicle_type:
                vehicle = VehicleOut(
                    type=profile.vehicle_type,
                    model=profile.vehicle_model,
                    plate=profile.plate_number,
                )

    completed_rides = 0
    if user.role in ("passenger", "driver"):
        field = Ride.passenger_id if user.role == "passenger" else Ride.driver_id
        completed_rides = (
            db.query(func.count(Ride.id)).filter(field == user.uid, Ride.status == "completed").scalar()
        )

    return UserProfileOut(
        uid=user.uid,
        role=user.role,
        name=user.name,
        email=user.email,
        status=user.status,
        created_at=user.created_at,
        rating_avg=rating_avg,
        rating_count=rating_count,
        completed_rides=completed_rides,
        vehicle=vehicle,
    )
