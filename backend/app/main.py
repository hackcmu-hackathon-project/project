from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import close_client, ensure_indexes, get_db
from .mapview import router as map_router
from .routes import router

settings = get_settings()

if settings.is_production and not settings.auth_enabled:
    raise RuntimeError(
        "ENV=production with no AUTH0_DOMAIN: the API would accept every request "
        "as the local dev user. Configure Auth0 or unset ENV."
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_indexes()
    yield
    await close_client()

app = FastAPI(
    title="Rove API",
    description="Ranked city experiences and itineraries.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(map_router)


@app.get("/health")
async def health():
    """Liveness plus a real database round-trip, for load balancers to poll."""
    try:
        await get_db().command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "ok": db_ok,
        "database": "up" if db_ok else "unreachable",
        "auth": "auth0" if settings.auth_enabled else "open (dev)",
        "env": settings.env,
    }
