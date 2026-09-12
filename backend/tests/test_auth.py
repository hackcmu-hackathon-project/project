import base64
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import (
    Auth0JWTValidator,
    Auth0TokenError,
    current_user,
)
from app.config import Settings, get_settings


def _base64url(value: int) -> str:
    byte_length = (value.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(value.to_bytes(byte_length, "big")).rstrip(b"=").decode()


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def signing_material() -> tuple[rsa.RSAPrivateKey, dict[str, str]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": "test-key",
        "use": "sig",
        "alg": "RS256",
        "n": _base64url(public_numbers.n),
        "e": _base64url(public_numbers.e),
    }
    return private_key, jwk


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "_env_file": None,
        "auth0_domain": "travel.us.auth0.com",
        "auth0_audience": "https://api.travel.example",
        "auth0_jwks_cache_seconds": 300,
    }
    values.update(overrides)
    return Settings(**values)


def _token(private_key: rsa.RSAPrivateKey, **overrides: object) -> str:
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": "auth0|traveler-123",
        "aud": "https://api.travel.example",
        "iss": "https://travel.us.auth0.com/",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "test-key"})


def _client_for(
    jwks: dict[str, object],
    calls: list[str],
    handler: Callable[[httpx.Request], httpx.Response] | None = None,
) -> httpx.AsyncClient:
    def default_handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, json=jwks)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler or default_handler))


@pytest.mark.anyio
async def test_validator_verifies_rs256_token_and_caches_jwks(signing_material):
    private_key, jwk = signing_material
    calls: list[str] = []
    client = _client_for({"keys": [jwk]}, calls)
    validator = Auth0JWTValidator(_settings(), client=client)

    assert (await validator.decode(_token(private_key)))["sub"] == "auth0|traveler-123"
    assert (await validator.decode(_token(private_key)))["aud"] == "https://api.travel.example"
    assert calls == ["https://travel.us.auth0.com/.well-known/jwks.json"]
    await client.aclose()


@pytest.mark.anyio
async def test_validator_refreshes_expired_jwks_cache(signing_material):
    private_key, jwk = signing_material
    calls: list[str] = []
    now = [0.0]
    client = _client_for({"keys": [jwk]}, calls)
    validator = Auth0JWTValidator(
        _settings(auth0_jwks_cache_seconds=10), client=client, monotonic=lambda: now[0]
    )

    await validator.decode(_token(private_key))
    now[0] = 10.0
    await validator.decode(_token(private_key))
    assert len(calls) == 2
    await client.aclose()


@pytest.mark.anyio
async def test_unknown_kid_refreshes_jwks_once(signing_material):
    _, jwk = signing_material
    replacement_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    replacement_numbers = replacement_key.public_key().public_numbers()
    replacement_jwk = {
        **jwk,
        "kid": "rotated-key",
        "n": _base64url(replacement_numbers.n),
        "e": _base64url(replacement_numbers.e),
    }
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        payload = {"keys": [jwk]} if len(calls) == 1 else {"keys": [replacement_jwk]}
        return httpx.Response(200, json=payload)

    client = _client_for({}, calls, handler)
    validator = Auth0JWTValidator(_settings(), client=client)
    rotated_token = jwt.encode(
        {
            "sub": "auth0|rotated",
            "aud": "https://api.travel.example",
            "iss": "https://travel.us.auth0.com/",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        replacement_key,
        algorithm="RS256",
        headers={"kid": "rotated-key"},
    )

    assert (await validator.decode(rotated_token))["sub"] == "auth0|rotated"
    assert len(calls) == 2
    await client.aclose()


@pytest.mark.anyio
async def test_validator_rejects_wrong_audience_issuer_expiry_and_subject(signing_material):
    private_key, jwk = signing_material
    client = _client_for({"keys": [jwk]}, [])
    validator = Auth0JWTValidator(_settings(), client=client)

    invalid_claims = (
        {"aud": "https://other.example"},
        {"iss": "https://other.example/"},
        {"exp": datetime.now(UTC) - timedelta(minutes=1)},
        {"sub": ""},
    )
    for overrides in invalid_claims:
        with pytest.raises(Auth0TokenError):
            await validator.decode(_token(private_key, **overrides))
    await client.aclose()


@pytest.mark.anyio
async def test_unknown_kid_refresh_is_bounded(signing_material):
    private_key, jwk = signing_material
    calls: list[str] = []
    client = _client_for({"keys": [jwk]}, calls)
    validator = Auth0JWTValidator(_settings(), client=client)

    unknown_token = jwt.encode(
        {
            "sub": "auth0|unknown",
            "aud": "https://api.travel.example",
            "iss": "https://travel.us.auth0.com/",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "unknown-key"},
    )
    with pytest.raises(Auth0TokenError):
        await validator.decode(unknown_token)
    assert len(calls) == 2
    await client.aclose()


@pytest.mark.anyio
async def test_unknown_kid_refresh_cooldown_applies_across_requests(signing_material):
    private_key, jwk = signing_material
    calls: list[str] = []
    now = [0.0]
    client = _client_for({"keys": [jwk]}, calls)
    validator = Auth0JWTValidator(
        _settings(auth0_jwks_refresh_cooldown_seconds=30),
        client=client,
        monotonic=lambda: now[0],
    )

    def unknown_token(kid: str) -> str:
        return jwt.encode(
            {
                "sub": f"auth0|{kid}",
                "aud": "https://api.travel.example",
                "iss": "https://travel.us.auth0.com/",
                "exp": datetime.now(UTC) + timedelta(minutes=5),
            },
            private_key,
            algorithm="RS256",
            headers={"kid": kid},
        )

    for kid in ("unknown-one", "unknown-two"):
        with pytest.raises(Auth0TokenError):
            await validator.decode(unknown_token(kid))
    assert len(calls) == 2

    now[0] = 30.0
    with pytest.raises(Auth0TokenError):
        await validator.decode(unknown_token("unknown-three"))
    assert len(calls) == 3
    await client.aclose()


def _app(settings: Settings, validator: Auth0JWTValidator | None = None) -> FastAPI:
    app = FastAPI()
    app.state.settings = settings
    if validator is not None:
        app.state.auth0_validator = validator
    app.dependency_overrides[get_settings] = lambda: settings

    @app.get("/private")
    async def private(user=Depends(current_user)):  # noqa: B008
        return user.__dict__

    return app


def test_blank_domain_keeps_local_dev_mode():
    with TestClient(_app(Settings(_env_file=None))) as client:
        response = client.get("/private")

    assert response.status_code == 200
    assert response.json() == {
        "sub": "dev|local",
        "name": "Local Dev",
        "email": "dev@rove.local",
        "picture": None,
    }


def test_invalid_credentials_return_generic_401(signing_material):
    _, jwk = signing_material
    client = _client_for({"keys": [jwk]}, [])
    validator = Auth0JWTValidator(_settings(), client=client)

    with TestClient(_app(_settings(), validator)) as test_client:
        response = test_client.get("/private", headers={"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["detail"] == "Invalid authentication credentials"


def test_jwks_upstream_failure_returns_generic_503(signing_material):
    private_key, _ = signing_material
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(503, request=request)

    validator = Auth0JWTValidator(
        _settings(), client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    token = _token(private_key)
    with TestClient(_app(_settings(), validator)) as client:
        response = client.get("/private", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication service unavailable"
