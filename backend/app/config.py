from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "rove"

    auth0_domain: str = ""
    auth0_audience: str = "https://rove.api"
    auth0_issuer: str | None = None
    auth0_jwks_cache_seconds: int = 300
    auth0_jwks_refresh_cooldown_seconds: int = 30

    port: int = 8000
    cors_origins: str = "*"

    @property
    def auth_enabled(self) -> bool:
        """No Auth0 domain means local dev mode: every caller is the dev user.

        Keep this switch tied to the existing ``AUTH0_DOMAIN`` setting so a
        blank-domain local checkout remains usable without Auth0.
        """
        return bool(self.auth0_domain.strip())

    @property
    def auth0_issuer_url(self) -> str | None:
        """Return the normalized issuer used for JWT and JWKS validation."""
        if self.auth0_issuer and self.auth0_issuer.strip():
            return self.auth0_issuer.strip().rstrip("/") + "/"
        if self.auth0_domain and self.auth0_domain.strip():
            return f"https://{self.auth0_domain.strip().rstrip('/')}/"
        return None

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
