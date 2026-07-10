from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

from app.core.firebase import get_firebase_app, get_firestore_client

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    uid: str
    email: str | None
    role: str | None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    get_firebase_app()

    try:
        decoded_token = firebase_auth.verify_id_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    uid = decoded_token["uid"]

    # Role rides along as a custom claim on the verified token (see
    # /auth/claims and the admin custom-token login) once a session has been
    # through that flow - no Firestore read needed on the hot path. Tokens
    # minted before that (older sessions, or the brief window right after
    # signup before the claim's been synced) fall back to the old lookup.
    role = decoded_token.get("role")
    if role is None:
        user_doc = get_firestore_client().collection("users").document(uid).get()
        role = user_doc.to_dict().get("role") if user_doc.exists else None

    return CurrentUser(uid=uid, email=decoded_token.get("email"), role=role)


def require_role(*allowed_roles: str):
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return dependency
