from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import close_client, ensure_indexes
from .routes import router


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_indexes()
    yield
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
