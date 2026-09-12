"""Auth0 access-token verification.

Tokens are RS256-signed by Auth0; we fetch the tenant's JWKS once and cache it.
With no AUTH0_DOMAIN configured the app runs open and every request is attributed
to a single local dev user, so the stack is usable before Auth0 exists.
"""

from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError

from .config import Settings, get_settings

_jwks_cache: dict[str, dict] = {}

bearer = HTTPBearer(auto_error=False)

DEV_USER = {
    "sub": "dev|local",
    "name": "Local Dev",
    "email": "dev@rove.local",
    "picture": None,
}


@dataclass
class Principal:
    sub: str
    name: str
    email: str | None = None
    picture: str | None = None


async def _jwks(settings: Settings) -> dict:
    key = settings.auth0_domain
    if key not in _jwks_cache:
        url = f"https://{key}/.well-known/jwks.json"
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url)
            res.raise_for_status()
            _jwks_cache[key] = res.json()
    return _jwks_cache[key]


async def current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> Principal:
    if not settings.auth_enabled:
        return Principal(**DEV_USER)

    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = creds.credentials
    try:
        header = jwt.get_unverified_header(token)
        jwks = await _jwks(settings)
        key = next((k for k in jwks["keys"] if k["kid"] == header.get("kid")), None)
        if key is None:
            # Key rotation: drop the cache and try once more.
            _jwks_cache.pop(settings.auth0_domain, None)
            jwks = await _jwks(settings)
            key = next((k for k in jwks["keys"] if k["kid"] == header.get("kid")), None)
        if key is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown signing key")

        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.auth0_audience,
            issuer=f"https://{settings.auth0_domain}/",
        )
    except HTTPException:
        raise
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc

    return Principal(
        sub=claims["sub"],
        name=claims.get("name") or claims.get("nickname") or claims.get("email") or "Traveler",
        email=claims.get("email"),
        picture=claims.get("picture"),
    )
