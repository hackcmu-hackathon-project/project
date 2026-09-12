"""Saves, reactions and comments.

A "post" in Rove is a person's ranking of an item, addressed by `(sub, item_id)`.
Reactions and comments hang off that pair; there is no separate post document to
keep in sync with the ranking.
"""

import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from .models import Comment

#: The reaction palette, in the order the app shows it.
EMOJI = ["🔥", "😍", "👏", "😂", "🤔", "😭"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def post_id(owner: str, item_id: int) -> str:
    return f"{owner}#{item_id}"


# ------------------------------------------------------------------ want to go


async def save(db: AsyncIOMotorDatabase, sub: str, item_id: int) -> None:
    await db.saves.update_one(
        {"_id": f"{sub}#{item_id}"},
        {"$set": {"sub": sub, "item_id": item_id}, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )


async def unsave(db: AsyncIOMotorDatabase, sub: str, item_id: int) -> None:
    await db.saves.delete_one({"_id": f"{sub}#{item_id}"})


async def saved_ids(db: AsyncIOMotorDatabase, sub: str) -> list[int]:
    rows = await db.saves.find({"sub": sub}, {"item_id": 1}).sort("created_at", -1).to_list(500)
    return [r["item_id"] for r in rows]


# -------------------------------------------------------------------- reactions


async def react(db: AsyncIOMotorDatabase, actor: str, owner: str, item_id: int, emoji: str) -> None:
    """One reaction per person per post; reacting again replaces it."""
    await db.reactions.update_one(
        {"_id": f"{actor}@{post_id(owner, item_id)}"},
        {
            "$set": {"actor": actor, "post": post_id(owner, item_id), "emoji": emoji, "at": _now()},
        },
        upsert=True,
    )


async def unreact(db: AsyncIOMotorDatabase, actor: str, owner: str, item_id: int) -> None:
    await db.reactions.delete_one({"_id": f"{actor}@{post_id(owner, item_id)}"})


async def reaction_summary(db: AsyncIOMotorDatabase, posts: list[str], viewer: str) -> dict[str, dict]:
    """`{post: {"counts": {emoji: n}, "mine": emoji | None}}` for many posts at once."""
    if not posts:
        return {}
    rows = await db.reactions.find({"post": {"$in": posts}}).to_list(5000)
    out: dict[str, dict] = {p: {"counts": {}, "mine": None} for p in posts}
    for r in rows:
        bucket = out[r["post"]]["counts"]
        bucket[r["emoji"]] = bucket.get(r["emoji"], 0) + 1
        if r["actor"] == viewer:
            out[r["post"]]["mine"] = r["emoji"]
    return out


# --------------------------------------------------------------------- comments


async def add_comment(db: AsyncIOMotorDatabase, author: str, owner: str, item_id: int, text: str) -> str:
    cid = uuid.uuid4().hex
    await db.comments.insert_one(
        {
            "_id": cid,
            "post": post_id(owner, item_id),
            "author": author,
            "text": text.strip(),
            "created_at": _now(),
        }
    )
    return cid


async def delete_comment(db: AsyncIOMotorDatabase, author: str, comment_id: str) -> int:
    res = await db.comments.delete_one({"_id": comment_id, "author": author})
    return res.deleted_count


async def comments_for(db: AsyncIOMotorDatabase, owner: str, item_id: int, viewer: str) -> list[Comment]:
    rows = await db.comments.find({"post": post_id(owner, item_id)}).sort("created_at", 1).to_list(500)
    if not rows:
        return []
    authors = await db.users.find({"_id": {"$in": list({r["author"] for r in rows})}}).to_list(200)
    by_sub = {a["_id"]: a for a in authors}
    return [
        Comment(
            id=r["_id"],
            author_sub=r["author"],
            author_name=by_sub.get(r["author"], {}).get("name", "Someone"),
            author_color=by_sub.get(r["author"], {}).get("color", "#8a2d6e"),
            text=r["text"],
            created_at=r["created_at"],
            mine=r["author"] == viewer,
        )
        for r in rows
    ]


async def comment_counts(db: AsyncIOMotorDatabase, posts: list[str]) -> dict[str, int]:
    if not posts:
        return {}
    rows = await db.comments.aggregate(
        [{"$match": {"post": {"$in": posts}}}, {"$group": {"_id": "$post", "n": {"$sum": 1}}}]
    ).to_list(len(posts))
    return {r["_id"]: r["n"] for r in rows}
