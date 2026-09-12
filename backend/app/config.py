from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # .env is committed; .env.local is gitignored and wins, so secrets (API keys,
    # an Atlas URI with a password) never end up in the repository.
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "rove"

    auth0_domain: str = ""
    #: API identifier, when one is registered in Auth0. Blank means the app
    #: sends ID tokens instead, verified against auth0_client_id.
    auth0_audience: str = ""
    auth0_client_id: str = ""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    port: int = 8000
    cors_origins: str = "*"
    #: Set ENV=production to refuse to start without Auth0 configured.
    env: str = "development"

    @property
    def auth_enabled(self) -> bool:
        """No Auth0 domain means local dev mode: every caller is the dev user."""
        return bool(self.auth0_domain)

    @property
    def allowed_audiences(self) -> list[str]:
        """Every `aud` we will accept: the API identifier, the client ID, or both."""
        return [a for a in (self.auth0_audience, self.auth0_client_id) if a]

    @property
    def is_production(self) -> bool:
        return self.env.lower() in ("production", "prod")

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
