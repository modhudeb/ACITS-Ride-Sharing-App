import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.passwords import hash_password, verify_password
from app.core.rate_limit import rate_limit_by_ip
from app.core.security import create_access_token
from app.db.models import PasswordResetToken, User
from app.db.session import get_db
from app.models.auth import (
    AuthResponse,
    AuthUser,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    SignInRequest,
    SignUpRequest,
)
from app.services.email_service import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_TTL = timedelta(hours=1)

# A real (but unattainable) bcrypt hash - used to keep signin's response time
# for a nonexistent email indistinguishable from a wrong-password response,
# so the endpoint can't be used to enumerate registered accounts by timing.
_DUMMY_PASSWORD_HASH = "$2b$12$Ko.2rPzqweRMXsQniMzWR.Vf3ZM.asXJblNbbX4.EsOECm19Sq4Fy"


def _auth_response(user: User) -> AuthResponse:
    token = create_access_token(user.uid, user.role, user.email)
    return AuthResponse(
        token=token,
        user=AuthUser(uid=user.uid, name=user.name, email=user.email, role=user.role, status=user.status),
    )


@router.post("/signup", response_model=AuthResponse)
def signup(
    payload: SignUpRequest,
    _: None = Depends(rate_limit_by_ip("auth.signup", max_calls=10, window_seconds=60)),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = User(
        uid=str(uuid.uuid4()),
        role=payload.role,
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        status="pending_approval" if payload.role == "driver" else "active",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()

    return _auth_response(user)


@router.post("/signin", response_model=AuthResponse)
def signin(
    payload: SignInRequest,
    _: None = Depends(rate_limit_by_ip("auth.signin", max_calls=20, window_seconds=60)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    # Constant-time compare either way - verify_password() runs bcrypt's
    # comparison even against a placeholder hash, so a nonexistent-email
    # response takes the same time as a wrong-password one and can't be used
    # to enumerate registered accounts by response latency.
    password_hash = (user.password_hash if user else None) or _DUMMY_PASSWORD_HASH
    valid = verify_password(payload.password, password_hash)

    if not user or not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    return _auth_response(user)


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    _: None = Depends(rate_limit_by_ip("auth.forgot_password", max_calls=5, window_seconds=300)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    # Always return the same response whether or not the email is
    # registered - a differing response would let a caller enumerate
    # accounts by email.
    if user:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        now = datetime.now(timezone.utc)

        db.add(
            PasswordResetToken(
                token_hash=token_hash, uid=user.uid, expires_at=now + RESET_TOKEN_TTL, created_at=now
            )
        )
        db.commit()

        settings = get_settings()
        reset_link = f"{settings.frontend_base_url}/reset-password?token={raw_token}"
        send_password_reset_email(user.email, reset_link)

    return {"status": "ok"}


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    _: None = Depends(rate_limit_by_ip("auth.reset_password", max_calls=10, window_seconds=60)),
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    reset_row = db.get(PasswordResetToken, token_hash)

    # SQLite (used by the test suite / the no-DATABASE_URL fallback) doesn't
    # preserve tzinfo the way Postgres does, so a value read back from it can
    # come back naive - treat a naive value as the UTC it was always stored
    # as rather than let the comparison below raise.
    expires_at = reset_row.expires_at if reset_row else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not reset_row or expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has expired",
        )

    user = db.get(User, reset_row.uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This password reset link is invalid")

    user.password_hash = hash_password(payload.new_password)
    db.delete(reset_row)
    db.commit()

    return {"status": "ok"}
