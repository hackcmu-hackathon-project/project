"""The social graph: handles, search, follow/unfollow.

follows documents are `{_id: "<follower>→<followee>", follower, followee, created_at}`,
which makes both directions indexable and a follow idempotent.
"""

import re
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from .models import PublicUser


def _now() -> datetime:
    return datetime.now(timezone.utc)


def edge_id(follower: str, followee: str) -> str:
    return f"{follower}→{followee}"


def default_handle(name: str, email: str | None, sub: str) -> str:
    """A stable, readable @handle derived from whatever Auth0 gave us."""
    base = (email.split("@")[0] if email else name or sub).lower()
    base = re.sub(r"[^a-z0-9]+", "", base)[:18]
    return base or "traveler"


async def ensure_handle(db: AsyncIOMotorDatabase, sub: str, name: str, email: str | None) -> str:
    existing = await db.users.find_one({"_id": sub}, {"handle": 1})
    if existing and existing.get("handle"):
        return existing["handle"]

    candidate = default_handle(name, email, sub)
    handle = candidate
    n = 1
    while await db.users.find_one({"handle": handle, "_id": {"$ne": sub}}, {"_id": 1}):
        n += 1
        handle = f"{candidate}{n}"
    return handle


async def follow(db: AsyncIOMotorDatabase, follower: str, followee: str) -> None:
    if follower == followee:
        return
    await db.follows.update_one(
        {"_id": edge_id(follower, followee)},
        {"$set": {"follower": follower, "followee": followee}, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )


async def unfollow(db: AsyncIOMotorDatabase, follower: str, followee: str) -> None:
    await db.follows.delete_one({"_id": edge_id(follower, followee)})


async def following_subs(db: AsyncIOMotorDatabase, sub: str) -> list[str]:
    rows = await db.follows.find({"follower": sub}, {"followee": 1}).to_list(1000)
    return [r["followee"] for r in rows]


async def hydrate(db: AsyncIOMotorDatabase, docs: list[dict], viewer: str) -> list[PublicUser]:
    """Attach ranking counts, follower counts and the viewer's follow state."""
    if not docs:
        return []
    subs = [d["_id"] for d in docs]

    counts = await db.rankings.aggregate(
        [{"$match": {"sub": {"$in": subs}}}, {"$group": {"_id": "$sub", "n": {"$sum": 1}}}]
    ).to_list(len(subs))
    ranked_by = {c["_id"]: c["n"] for c in counts}

    followers = await db.follows.aggregate(
        [{"$match": {"followee": {"$in": subs}}}, {"$group": {"_id": "$followee", "n": {"$sum": 1}}}]
    ).to_list(len(subs))
    followers_by = {f["_id"]: f["n"] for f in followers}

    mine = set(await following_subs(db, viewer))

    tops = await db.rankings.find({"sub": {"$in": subs}}).sort("score", -1).to_list(2000)
    best: dict[str, int] = {}
    for row in tops:
        best.setdefault(row["sub"], row["item_id"])
    items = await db.items.find({"id": {"$in": list(best.values())}}, {"_id": 0, "id": 1, "title": 1}).to_list(200)
    title_by_id = {i["id"]: i["title"] for i in items}

    return [
        PublicUser(
            sub=d["_id"],
            name=d.get("name", "Traveler"),
            handle=d.get("handle") or default_handle(d.get("name", ""), d.get("email"), d["_id"]),
            picture=d.get("picture"),
            color=d.get("color", "#8a2d6e"),
            bio=d.get("bio", ""),
            ranked=ranked_by.get(d["_id"], 0),
            followers=followers_by.get(d["_id"], 0),
            following=d["_id"] in mine,
            top_pick=title_by_id.get(best.get(d["_id"], -1)),
        )
        for d in docs
    ]
