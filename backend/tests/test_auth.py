"""Password hashing, JWT issuance/verification, and the signup/signin/
password-reset endpoint functions - called directly against an in-memory
SQLite session, same pattern as test_ride_lifecycle.py.
"""
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1 import auth as auth_module
from app.core.passwords import hash_password, verify_password
from app.core.security import create_access_token, resolve_current_user
from app.db.models import PasswordResetToken, User
from app.db.session import Base
from app.models.auth import ForgotPasswordRequest, ResetPasswordRequest, SignInRequest, SignUpRequest


# --- password hashing -------------------------------------------------------

def test_hash_password_roundtrip():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)


def test_wrong_password_rejected():
    hashed = hash_password("correct horse battery staple")
    assert not verify_password("wrong password", hashed)


def test_hash_never_equals_plaintext():
    hashed = hash_password("secret123")
    assert hashed != "secret123"


def test_verify_password_handles_missing_hash_gracefully():
    assert not verify_password("anything", None)
    assert not verify_password("anything", "")


def test_hash_password_rejects_overlong_password():
    with pytest.raises(ValueError):
        hash_password("x" * 100)


# --- JWT ---------------------------------------------------------------------

def test_create_and_resolve_access_token():
    token = create_access_token("uid-123", "passenger", "rider@example.com")
    user = resolve_current_user(token)
    assert user.uid == "uid-123"
    assert user.role == "passenger"
    assert user.email == "rider@example.com"


def test_tampered_token_rejected():
    token = create_access_token("uid-123", "passenger", "rider@example.com")
    tampered = token[:-4] + "abcd"
    with pytest.raises(HTTPException) as exc:
        resolve_current_user(tampered)
    assert exc.value.status_code == 401


def test_expired_token_rejected(monkeypatch):
    from app.core.config import get_settings

    settings = get_settings()
    now = datetime.now(timezone.utc)
    expired_payload = {
        "sub": "uid-123",
        "role": "passenger",
        "email": "rider@example.com",
        "iat": now - timedelta(days=100),
        "exp": now - timedelta(days=1),
    }
    expired_token = jwt.encode(expired_payload, settings.jwt_secret_key, algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        resolve_current_user(expired_token)
    assert exc.value.status_code == 401


def test_token_signed_with_wrong_secret_rejected():
    now = datetime.now(timezone.utc)
    payload = {"sub": "uid-123", "role": "admin", "email": None, "iat": now, "exp": now + timedelta(days=1)}
    forged = jwt.encode(payload, "not-the-real-secret", algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        resolve_current_user(forged)
    assert exc.value.status_code == 401


# --- signup/signin/reset endpoint functions ----------------------------------

@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


def test_signup_creates_user_and_returns_token(db_session):
    result = auth_module.signup(
        SignUpRequest(email="new@example.com", password="strongpass1", name="New User", role="passenger"),
        _=None,
        db=db_session,
    )
    assert result.user.role == "passenger"
    assert result.user.status == "active"
    resolved = resolve_current_user(result.token)
    assert resolved.uid == result.user.uid


def test_driver_signup_is_pending_approval(db_session):
    result = auth_module.signup(
        SignUpRequest(email="newdriver@example.com", password="strongpass1", name="New Driver", role="driver"),
        _=None,
        db=db_session,
    )
    assert result.user.status == "pending_approval"


def test_signup_rejects_duplicate_email(db_session):
    payload = SignUpRequest(email="dupe@example.com", password="strongpass1", role="passenger")
    auth_module.signup(payload, _=None, db=db_session)
    with pytest.raises(HTTPException) as exc:
        auth_module.signup(payload, _=None, db=db_session)
    assert exc.value.status_code == 409


def test_signup_rejects_admin_role():
    with pytest.raises(ValueError):
        SignUpRequest(email="x@example.com", password="strongpass1", role="admin")


def test_signin_with_correct_password_succeeds(db_session):
    auth_module.signup(
        SignUpRequest(email="signin@example.com", password="strongpass1", role="passenger"), _=None, db=db_session
    )
    result = auth_module.signin(
        SignInRequest(email="signin@example.com", password="strongpass1"), _=None, db=db_session
    )
    assert result.user.email == "signin@example.com"


def test_signin_with_wrong_password_rejected(db_session):
    auth_module.signup(
        SignUpRequest(email="signin2@example.com", password="strongpass1", role="passenger"), _=None, db=db_session
    )
    with pytest.raises(HTTPException) as exc:
        auth_module.signin(SignInRequest(email="signin2@example.com", password="wrongpass"), _=None, db=db_session)
    assert exc.value.status_code == 401


def test_signin_with_nonexistent_email_rejected(db_session):
    with pytest.raises(HTTPException) as exc:
        auth_module.signin(SignInRequest(email="nobody@example.com", password="whatever1"), _=None, db=db_session)
    assert exc.value.status_code == 401


def test_signin_timing_is_similar_for_missing_vs_wrong_password(db_session):
    """Not a precise timing-attack test (too flaky for CI), just confirms the
    dummy-hash comparison path actually runs bcrypt rather than short-circuiting."""
    auth_module.signup(
        SignUpRequest(email="timing@example.com", password="strongpass1", role="passenger"), _=None, db=db_session
    )

    def timed(fn):
        start = time.perf_counter()
        try:
            fn()
        except HTTPException:
            pass
        return time.perf_counter() - start

    wrong_password_time = timed(
        lambda: auth_module.signin(
            SignInRequest(email="timing@example.com", password="wrongpass"), _=None, db=db_session
        )
    )
    missing_email_time = timed(
        lambda: auth_module.signin(
            SignInRequest(email="ghost@example.com", password="wrongpass"), _=None, db=db_session
        )
    )
    # Both paths run a real bcrypt comparison, so neither should be
    # near-instant relative to the other - a 0ms missing-email response
    # would indicate the dummy-hash comparison was skipped.
    assert missing_email_time > 0.001
    assert wrong_password_time > 0.001


def test_forgot_password_creates_reset_token_for_existing_user(db_session):
    signup_result = auth_module.signup(
        SignUpRequest(email="reset@example.com", password="strongpass1", role="passenger"), _=None, db=db_session
    )
    auth_module.forgot_password(ForgotPasswordRequest(email="reset@example.com"), _=None, db=db_session)

    tokens = db_session.query(PasswordResetToken).filter(PasswordResetToken.uid == signup_result.user.uid).all()
    assert len(tokens) == 1


def test_forgot_password_for_unknown_email_is_silent(db_session):
    # No exception, no token row - same response either way so the endpoint
    # can't be used to enumerate registered emails.
    result = auth_module.forgot_password(ForgotPasswordRequest(email="unknown@example.com"), _=None, db=db_session)
    assert result == {"status": "ok"}
    assert db_session.query(PasswordResetToken).count() == 0


def test_reset_password_with_valid_token_changes_password(db_session, monkeypatch):
    captured_link = {}
    monkeypatch.setattr(
        auth_module, "send_password_reset_email", lambda email, link: captured_link.update(email=email, link=link)
    )

    auth_module.signup(
        SignUpRequest(email="resettable@example.com", password="oldpassword1", role="passenger"), _=None, db=db_session
    )
    auth_module.forgot_password(ForgotPasswordRequest(email="resettable@example.com"), _=None, db=db_session)

    raw_token = captured_link["link"].split("token=")[1]
    auth_module.reset_password(
        ResetPasswordRequest(token=raw_token, new_password="newpassword1"), _=None, db=db_session
    )

    # Old password no longer works, new one does.
    with pytest.raises(HTTPException):
        auth_module.signin(
            SignInRequest(email="resettable@example.com", password="oldpassword1"), _=None, db=db_session
        )
    result = auth_module.signin(
        SignInRequest(email="resettable@example.com", password="newpassword1"), _=None, db=db_session
    )
    assert result.user.email == "resettable@example.com"


def test_reset_password_token_is_single_use(db_session, monkeypatch):
    captured_link = {}
    monkeypatch.setattr(
        auth_module, "send_password_reset_email", lambda email, link: captured_link.update(link=link)
    )
    auth_module.signup(
        SignUpRequest(email="oneshot@example.com", password="oldpassword1", role="passenger"), _=None, db=db_session
    )
    auth_module.forgot_password(ForgotPasswordRequest(email="oneshot@example.com"), _=None, db=db_session)
    raw_token = captured_link["link"].split("token=")[1]

    auth_module.reset_password(ResetPasswordRequest(token=raw_token, new_password="newpassword1"), _=None, db=db_session)
    with pytest.raises(HTTPException) as exc:
        auth_module.reset_password(ResetPasswordRequest(token=raw_token, new_password="anotherpass1"), _=None, db=db_session)
    assert exc.value.status_code == 400


def test_reset_password_rejects_garbage_token(db_session):
    with pytest.raises(HTTPException) as exc:
        auth_module.reset_password(ResetPasswordRequest(token="not-a-real-token", new_password="whatever1"), _=None, db=db_session)
    assert exc.value.status_code == 400


def test_reset_password_rejects_expired_token(db_session):
    signup_result = auth_module.signup(
        SignUpRequest(email="expired@example.com", password="oldpassword1", role="passenger"), _=None, db=db_session
    )
    import hashlib

    raw_token = "expired-token-value"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    db_session.add(
        PasswordResetToken(
            token_hash=token_hash,
            uid=signup_result.user.uid,
            expires_at=now - timedelta(minutes=1),
            created_at=now - timedelta(hours=2),
        )
    )
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        auth_module.reset_password(ResetPasswordRequest(token=raw_token, new_password="whatever1"), _=None, db=db_session)
    assert exc.value.status_code == 400


# --- admin login ---------------------------------------------------------

def test_admin_login_creates_admin_row_and_issues_admin_token(db_session, monkeypatch):
    from app.api.v1 import admin as admin_module
    from app.core.config import get_settings
    from app.models.admin import AdminLoginRequest

    settings = get_settings()
    result = admin_module.admin_login(
        AdminLoginRequest(username=settings.admin_username, password=settings.admin_password),
        _=None,
        db=db_session,
    )
    assert result.user.role == "admin"
    resolved = resolve_current_user(result.token)
    assert resolved.role == "admin"

    # Re-login reuses the same row rather than creating a second one.
    admin_module.admin_login(
        AdminLoginRequest(username=settings.admin_username, password=settings.admin_password),
        _=None,
        db=db_session,
    )
    assert db_session.query(User).filter(User.role == "admin").count() == 1


def test_admin_login_rejects_wrong_password(db_session):
    from app.api.v1 import admin as admin_module
    from app.models.admin import AdminLoginRequest

    with pytest.raises(HTTPException) as exc:
        admin_module.admin_login(AdminLoginRequest(username="admin", password="wrong"), _=None, db=db_session)
    assert exc.value.status_code == 401
