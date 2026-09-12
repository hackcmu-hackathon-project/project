from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import get_settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(get_settings().mongodb_uri, uuidRepresentation="standard")
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[get_settings().mongodb_db]


async def ensure_indexes() -> None:
    db = get_db()
    await db.items.create_index("city")
    await db.items.create_index([("title", "text"), ("hood", "text")])
    await db.rankings.create_index([("sub", 1), ("item_id", 1)], unique=True)
    await db.rankings.create_index([("sub", 1), ("score", -1)])
    await db.rankings.create_index("updated_at")
    await db.rank_sessions.create_index("created_at", expireAfterSeconds=3600)
    await db.users.create_index("handle", unique=True, sparse=True)
    await db.follows.create_index("follower")
    await db.follows.create_index("followee")


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
