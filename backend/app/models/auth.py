from pydantic import BaseModel, EmailStr, Field, field_validator

SELF_SERVE_ROLES = ("passenger", "driver")


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(default="", max_length=200)
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        # Mirrors the old Firestore security rule that pinned self-serve
        # signup to non-privileged roles - a client still can't hand itself
        # role:"admin" by calling this endpoint directly.
        if value not in SELF_SERVE_ROLES:
            raise ValueError(f"role must be one of {SELF_SERVE_ROLES}")
        return value


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)


class AuthUser(BaseModel):
    uid: str
    name: str | None
    email: str | None
    role: str | None
    status: str


class AuthResponse(BaseModel):
    token: str
    user: AuthUser
