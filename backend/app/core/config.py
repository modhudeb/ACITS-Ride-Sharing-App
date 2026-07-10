from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    firebase_project_id: str = ""
    google_application_credentials: str = ""
    firebase_service_account_json: str = ""
    firestore_database_id: str = ""
    mapbox_token: str = ""
    groq_api_key: str = ""
    cors_origins: str = "http://localhost:5173"
    admin_username: str = "admin"
    admin_password: str = "admin"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
