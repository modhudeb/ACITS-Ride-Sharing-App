from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    # SQLite fallback keeps tests/CI dependency-free; real dev/prod always
    # sets DATABASE_URL to Neon (see .env / .env.example).
    database_url: str = "sqlite:///./acits_dev.db"
    # Dev-only default so a fresh clone runs without extra setup - every real
    # deployment MUST set its own (see .env.example). Anyone holding this
    # value can forge tokens for any account, so it's exactly as sensitive as
    # a database password.
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_access_token_ttl_days: int = 30
    mapbox_token: str = ""
    groq_api_key: str = ""
    cors_origins: str = "http://localhost:5173"
    admin_username: str = "admin"
    admin_password: str = "admin"
    # Optional - password-reset emails just log the reset link to the server
    # console when these aren't set, so local dev works with zero setup.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "no-reply@acits.local"
    # Used to build the link inside password-reset emails.
    frontend_base_url: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
