import inspect
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import close_client, ensure_indexes
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await ensure_indexes()
        yield
    finally:
        # Auth validation may own an HTTP client of its own. Keep Mongo cleanup
        # in a nested finally so one resource's shutdown cannot strand the
        # other when startup or application shutdown fails.
        validator = getattr(app.state, "auth0_validator", None)
        try:
            if validator is not None:
                result = validator.close()
                if inspect.isawaitable(result):
                    await result
        finally:
            # Index creation can fail during startup, and application shutdown
            # can also be triggered by an exception inside the lifespan body.
            await close_client()


settings = get_settings()

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


@app.get("/health")
async def health():
    return {"ok": True, "auth": "auth0" if settings.auth_enabled else "open (dev)"}
