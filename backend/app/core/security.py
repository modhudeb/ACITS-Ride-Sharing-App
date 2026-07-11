from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)

JWT_ALGORITHM = "HS256"


@dataclass
class CurrentUser:
    uid: str
    email: str | None
    role: str | None


def create_access_token(uid: str, role: str | None, email: str | None) -> str:
    """Role/email are baked in at mint time rather than looked up per
    request - both are immutable for the lifetime of an account in this app
    (no in-app "change role" or "change email" action exists), so there's no
    staleness risk, and every request is authenticated from the token alone
    with zero database round trip."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": uid,
        "role": role,
        "email": email,
        "iat": now,
        "exp": now + timedelta(days=settings.jwt_access_token_ttl_days),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=JWT_ALGORITHM)


def resolve_current_user(token: str) -> CurrentUser:
    """Verifies a self-issued JWT. Shared by the HTTP dependency below and
    the WebSocket endpoint, which authenticates via a query param instead of
    an Authorization header and so can't use HTTPBearer/Depends directly."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    return CurrentUser(uid=payload["sub"], email=payload.get("email"), role=payload.get("role"))


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    return resolve_current_user(credentials.credentials)


def require_role(*allowed_roles: str):
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return dependency
