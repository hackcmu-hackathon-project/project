"""Auth0 access-token verification for the API.

The mobile client uses Expo AuthSession's native authorization-code + PKCE flow
and sends the resulting access token to this API.  The API verifies that token
locally with Auth0's RS256 signing keys; it does not exchange authorization
codes or expose a browser callback.

When ``AUTH0_DOMAIN`` is blank, the existing local-development mode remains
open and all requests use ``DEV_USER``.  Set the domain in deployed
environments so requests must carry a valid Auth0 access token.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError

from .config import Settings, get_settings

Claims = dict[str, Any]


class Auth0ConfigurationError(RuntimeError):
    """Raised when the application cannot validate Auth0 tokens yet."""


class Auth0JWKSFetchError(RuntimeError):
    """Raised when Auth0's signing keys cannot be fetched or parsed."""


class Auth0TokenError(ValueError):
    """Raised when a bearer token is malformed or fails validation."""


DEV_USER = {
    "sub": "dev|local",
    "name": "Local Dev",
    "email": "dev@rove.local",
    "picture": None,
}


@dataclass
class Principal:
    """The small identity projection used by the existing route layer."""

    sub: str
    name: str
    email: str | None = None
    picture: str | None = None


class Auth0JWTValidator:
    """Validate Auth0 RS256 access tokens against a cached tenant JWKS."""

    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.settings = settings
        self._client = client
        self._owns_client = client is None
        self._monotonic = monotonic
        self._jwks: tuple[Mapping[str, Any], ...] = ()
        self._jwks_fetched_at: float | None = None
        self._last_unknown_kid_refresh_at: float | None = None
        self._jwks_lock = asyncio.Lock()

    @property
    def jwks_url(self) -> str:
        issuer = self._issuer_url()
        return f"{issuer.rstrip('/')}/.well-known/jwks.json"

    def _issuer_url(self) -> str:
        issuer = self.settings.auth0_issuer_url
        audience = self.settings.auth0_audience
        if not issuer or not audience or not audience.strip():
            raise Auth0ConfigurationError(
                "Auth0 requires an issuer URL and API audience before tokens can be validated"
            )
        return issuer

    async def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client

    async def close(self) -> None:
        """Close an HTTP client created by this validator."""

        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _cache_is_fresh(self) -> bool:
        cache_seconds = max(0, self.settings.auth0_jwks_cache_seconds)
        return (
            bool(self._jwks)
            and self._jwks_fetched_at is not None
            and self._monotonic() - self._jwks_fetched_at < cache_seconds
        )

    async def _fetch_jwks(self) -> tuple[Mapping[str, Any], ...]:
        try:
            response = await (await self._http_client()).get(self.jwks_url)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise Auth0JWKSFetchError("Unable to retrieve Auth0 signing keys") from exc

        keys = payload.get("keys") if isinstance(payload, Mapping) else None
        if not isinstance(keys, list) or not all(isinstance(key, Mapping) for key in keys):
            raise Auth0JWKSFetchError("Auth0 returned an invalid JWKS document")

        parsed_keys = tuple(keys)
        self._jwks = parsed_keys
        self._jwks_fetched_at = self._monotonic()
        return parsed_keys

    async def _get_jwks(self, *, force_refresh: bool = False) -> tuple[Mapping[str, Any], ...]:
        if not force_refresh and self._cache_is_fresh():
            return self._jwks

        async with self._jwks_lock:
            if not force_refresh and self._cache_is_fresh():
                return self._jwks
            return await self._fetch_jwks()

    async def _refresh_for_unknown_kid(self) -> tuple[Mapping[str, Any], ...]:
        """Refresh once per cooldown window when a token names an unknown key.

        A per-token retry handles normal key rotation, while the cooldown keeps
        arbitrary invalid ``kid`` values from turning every request into an
        upstream request.  The timestamp is recorded before the fetch so a
        failing upstream is throttled too.
        """

        cooldown = max(0, self.settings.auth0_jwks_refresh_cooldown_seconds)
        async with self._jwks_lock:
            now = self._monotonic()
            if (
                self._last_unknown_kid_refresh_at is not None
                and now - self._last_unknown_kid_refresh_at < cooldown
            ):
                return self._jwks
            self._last_unknown_kid_refresh_at = now
            return await self._fetch_jwks()

    @staticmethod
    def _key_for_kid(keys: tuple[Mapping[str, Any], ...], kid: str) -> Mapping[str, Any] | None:
        return next((key for key in keys if key.get("kid") == kid), None)

    async def decode(self, token: str) -> Claims:
        """Decode and validate one Auth0 access token."""

        self._issuer_url()
        if not token:
            raise Auth0TokenError("Bearer token is empty")

        try:
            header = jwt.get_unverified_header(token)
        except PyJWTError as exc:
            raise Auth0TokenError("Bearer token is malformed") from exc

        if header.get("alg") != "RS256":
            raise Auth0TokenError("Bearer token must use RS256")
        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            raise Auth0TokenError("Bearer token has no signing key ID")

        keys = await self._get_jwks()
        jwk = self._key_for_kid(keys, kid)
        if jwk is None:
            # Auth0 may rotate signing keys.  A token gets one bounded refresh
            # attempt, so an unknown kid cannot force unbounded upstream calls.
            keys = await self._refresh_for_unknown_kid()
            jwk = self._key_for_kid(keys, kid)
        if jwk is None:
            raise Auth0TokenError("Bearer token uses an unknown signing key")

        try:
            signing_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                audience=self.settings.auth0_audience,
                issuer=self._issuer_url(),
                options={"require": ["iss", "aud", "exp", "sub"]},
            )
        except (PyJWTError, TypeError, ValueError) as exc:
            raise Auth0TokenError("Bearer token failed validation") from exc

        if not isinstance(claims, dict):
            raise Auth0TokenError("Bearer token claims are invalid")
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            raise Auth0TokenError("Bearer token subject is empty")
        return claims


def get_auth0_validator(request: Request, settings: Settings | None = None) -> Auth0JWTValidator:
    """Return the process-local Auth0 validator associated with this app."""

    validator = getattr(request.app.state, "auth0_validator", None)
    if validator is None:
        state_settings = getattr(request.app.state, "settings", None)
        effective_settings = settings or state_settings or get_settings()
        validator = Auth0JWTValidator(effective_settings)
        request.app.state.auth0_validator = validator
    return validator


bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _auth_service_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Authentication service unavailable",
    )


async def current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),  # noqa: B008
    settings: Settings = Depends(get_settings),  # noqa: B008
) -> Principal:
    """Return the authenticated principal, or the local dev principal."""

    # Tests and application factories may keep their settings on app.state;
    # the dependency remains for compatibility with the existing app entrypoint.
    configured_settings = getattr(request.app.state, "settings", None) or settings

    # Preserve the existing blank-domain behavior for local development.  A
    # configured domain with incomplete settings is handled as a 503 below.
    if not configured_settings.auth_enabled:
        return Principal(**DEV_USER)

    if creds is None or creds.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        claims = await get_auth0_validator(request, configured_settings).decode(creds.credentials)
    except Auth0ConfigurationError as exc:
        raise _auth_service_unavailable() from exc
    except Auth0JWKSFetchError as exc:
        raise _auth_service_unavailable() from exc
    except Auth0TokenError as exc:
        raise _unauthorized() from exc

    sub = claims["sub"]
    name = claims.get("name") or claims.get("nickname") or claims.get("email") or "Traveler"
    return Principal(
        sub=sub,
        name=name if isinstance(name, str) else "Traveler",
        email=claims.get("email") if isinstance(claims.get("email"), str) else None,
        picture=claims.get("picture") if isinstance(claims.get("picture"), str) else None,
    )
