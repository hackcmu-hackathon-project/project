import inspect

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
    client = _client
    # Clear the shared reference before closing so a failed close cannot leave
    # a client that future requests might accidentally reuse.
    _client = None
    if client is not None:
        result = client.close()
        # Motor closes synchronously, but accepting an awaitable here keeps the
        # helper friendly to small async test doubles without changing the
        # production Motor lifecycle.
        if inspect.isawaitable(result):
            await result
