from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth as firebase_auth

from app.core.security import CurrentUser, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/claims")
def sync_role_claim(current_user: CurrentUser = Depends(get_current_user)):
    """Stamp the caller's Firestore-sourced role onto their Firebase Auth
    custom claims, so it rides along inside future ID tokens and
    get_current_user can stop reading Firestore on every request. Called
    once after signup/sign-in; idempotent, safe to call repeatedly.
    """
    if not current_user.role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No role on record for this account yet",
        )
    firebase_auth.set_custom_user_claims(current_user.uid, {"role": current_user.role})
    return {"role": current_user.role}
