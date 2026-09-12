from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "rove"

    auth0_domain: str = ""
    auth0_audience: str = "https://rove.api"

    port: int = 8000
    cors_origins: str = "*"

    @property
    def auth_enabled(self) -> bool:
        """No Auth0 domain means local dev mode: every caller is the dev user."""
        return bool(self.auth0_domain)

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
