from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/users", tags=["users"])


class UserProfileOut(BaseModel):
    uid: str
    role: str | None
    name: str | None
    email: str | None
    status: str


@router.get("/me", response_model=UserProfileOut)
def get_my_profile(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.get(User, current_user.uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return UserProfileOut(
        uid=user.uid, role=user.role, name=user.name, email=user.email, status=user.status
    )
