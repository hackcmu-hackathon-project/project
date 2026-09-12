"""Auth0 access-token verification.

Tokens are RS256-signed by Auth0; we fetch the tenant's JWKS once and cache it.
With no AUTH0_DOMAIN configured the app runs open and every request is attributed
to a single local dev user, so the stack is usable before Auth0 exists.

An API access token carries identity (``sub``) but no profile: Auth0 puts name,
email and picture in the *ID* token, which never reaches us. So the first time
we see a subject we spend one call on ``/userinfo`` and cache the result.
"""

import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError

from .config import Settings, get_settings

_jwks_cache: dict[str, dict] = {}

#: sub -> (expires_at, profile). Profiles change rarely; an hour is plenty.
_profile_cache: dict[str, tuple[float, dict]] = {}
_PROFILE_TTL = 3600.0

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


async def _userinfo(settings: Settings, sub: str, token: str) -> dict:
    """Profile for `sub`, from Auth0's /userinfo, cached for an hour.

    A failure here is never fatal — the caller falls back to the bare token
    claims rather than refusing an otherwise valid request.
    """
    cached = _profile_cache.get(sub)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"https://{settings.auth0_domain}/userinfo",
                headers={"Authorization": f"Bearer {token}"},
            )
            res.raise_for_status()
            profile = res.json()
    except Exception:
        return {}
    _profile_cache[sub] = (time.monotonic() + _PROFILE_TTL, profile)
    return profile


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

        # Two token shapes are legitimate here: an API access token (aud = the
        # API identifier) and, on a tenant with no API registered, an ID token
        # (aud = the client ID). Verify the signature once, then check `aud`
        # ourselves against the set we accept.
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=f"https://{settings.auth0_domain}/",
            # Phones and laptops drift; a little slack beats spurious 401s.
            options={"leeway": 60, "verify_aud": False},
        )
        allowed = settings.allowed_audiences
        if allowed:
            aud = claims.get("aud")
            presented = aud if isinstance(aud, list) else [aud]
            if not any(a in allowed for a in presented):
                raise HTTPException(
                    status.HTTP_401_UNAUTHORIZED, "Token was not issued for this API"
                )
    except HTTPException:
        raise
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc

    sub = claims["sub"]
    profile: dict = {}
    if not (claims.get("name") or claims.get("email")):
        profile = await _userinfo(settings, sub, token)

    def pick(field: str):
        return claims.get(field) or profile.get(field)

    return Principal(
        sub=sub,
        name=pick("name") or pick("nickname") or pick("email") or "Traveler",
        email=pick("email"),
        picture=pick("picture"),
    )
