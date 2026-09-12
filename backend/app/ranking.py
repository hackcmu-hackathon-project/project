"""The ranking engine.

Placing one experience rewrites every score in its tier, so all of it lives
server-side: the client only answers "which was better?" and is told where the
new entry landed.
"""

import math
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import UpdateOne

from .models import TIER_BANDS, Item, RankState


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def item_or_404(db: AsyncIOMotorDatabase, item_id: int) -> Item:
    doc = await db.items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No item {item_id}")
    return Item(**doc)


async def ranked_items(db: AsyncIOMotorDatabase, sub: str, city: str | None = None) -> list[dict]:
    """The caller's rankings, best first, each joined to its item."""
    match: dict = {"sub": sub}
    rows = await db.rankings.find(match, {"_id": 0}).sort([("score", -1), ("position", 1), ("item_id", 1)]).to_list(None)
    if not rows:
        return []
    items = await db.items.find({"id": {"$in": [r["item_id"] for r in rows]}}, {"_id": 0}).to_list(None)
    by_id = {i["id"]: i for i in items}
    out = [{**r, "item": by_id[r["item_id"]]} for r in rows if r["item_id"] in by_id]
    if city:
        out = [r for r in out if r["item"]["city"] == city]
    return out


async def _tier_pool(db: AsyncIOMotorDatabase, sub: str, city: str, tier: str, exclude: int) -> list[int]:
    rows = await ranked_items(db, sub, city)
    return [r["item_id"] for r in rows if r["tier"] == tier and r["item_id"] != exclude]


async def _rescore(db, sub: str, tier: str, pool: list[int]) -> dict[int, float]:
    if not pool:
        return {}
    low, high = TIER_BANDS[tier]
    scores = {id: round(high - (high - low) * i / (len(pool) - 1), 1)
              if len(pool) > 1 else round((low + high) / 2, 1) for i, id in enumerate(pool)}
    await db.rankings.bulk_write([
        UpdateOne({'sub': sub, 'item_id': id}, {
            '$set': {'tier': tier, 'score': scores[id], 'position': i, 'updated_at': _now()},
            '$setOnInsert': {'created_at': _now()},
        }, upsert=True) for i, id in enumerate(pool)
    ])
    return scores


async def _commit(db: AsyncIOMotorDatabase, sub: str, item: Item, tier: str, pos: int) -> RankState:
    previous = await db.rankings.find_one({'sub': sub, 'item_id': item.id})
    pool = await _tier_pool(db, sub, item.city, tier, item.id)
    pool.insert(max(0, min(pos, len(pool))), item.id)
    scores = await _rescore(db, sub, tier, pool)
    if previous and previous['tier'] != tier:
        old = await _tier_pool(db, sub, item.city, previous['tier'], item.id)
        await _rescore(db, sub, previous['tier'], old)
    await db.rank_sessions.delete_many({'sub': sub})

    # Having been somewhere retires it from "want to go".
    await db.saves.delete_one({"_id": f"{sub}#{item.id}"})

    city_rows = await ranked_items(db, sub, item.city)
    rank = next((i + 1 for i, r in enumerate(city_rows) if r["item_id"] == item.id), 1)
    return RankState(
        session_id="",
        done=True,
        item=item,
        score=scores[item.id],
        rank=rank,
        total=len(city_rows),
    )


async def _state_for(db: AsyncIOMotorDatabase, sub: str, session: dict) -> RankState:
    """Either the next duel, or the committed result."""
    lo, hi = session["lo"], session["hi"]
    if lo >= hi:
        item = await item_or_404(db, session["item_id"])
        result = await _commit(db, sub, item, session["tier"], lo)
        await db.rank_sessions.delete_one({"_id": session["_id"]})
        return result.model_copy(update={"session_id": session["_id"]})

    mid = (lo + hi) // 2
    opponent = await item_or_404(db, session["pool"][mid])
    opp_row = await db.rankings.find_one({"sub": sub, "item_id": opponent.id}, {"_id": 0})
    city_rows = await ranked_items(db, sub, opponent.city)
    opp_rank = next((i + 1 for i, r in enumerate(city_rows) if r["item_id"] == opponent.id), None)
    return RankState(
        session_id=session["_id"],
        done=False,
        comparison=session["n"],
        opponent=opponent,
        opponent_rank=opp_rank,
        opponent_score=(opp_row or {}).get("score"),
    )


async def start(db: AsyncIOMotorDatabase, sub: str, item_id: int, tier: str) -> RankState:
    item = await item_or_404(db, item_id)
    pool = await _tier_pool(db, sub, item.city, tier, item_id)

    # First entry in the tier: nothing to compare against.
    if not pool:
        result = await _commit(db, sub, item, tier, 0)
        return result

    session = {
        "_id": uuid.uuid4().hex,
        "sub": sub,
        "item_id": item_id,
        "tier": tier,
        "pool": pool,
        "lo": 0,
        "hi": len(pool),
        "n": 1,
        "expected": max(1, math.ceil(math.log2(len(pool) + 1))),
        "created_at": _now(),
    }
    await db.rank_sessions.insert_one(session)
    return await _state_for(db, sub, session)


async def compare(db: AsyncIOMotorDatabase, sub: str, session_id: str, winner: str) -> RankState:
    session = await db.rank_sessions.find_one({"_id": session_id, "sub": sub, "created_at": {"$gt": _now() - timedelta(hours=1)}})
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ranking session expired — start again")

    mid = (session["lo"] + session["hi"]) // 2
    if winner == "new":
        session["hi"] = mid
    else:
        session["lo"] = mid + 1
    session["n"] += 1

    await db.rank_sessions.update_one(
        {"_id": session_id},
        {"$set": {"lo": session["lo"], "hi": session["hi"], "n": session["n"]}},
    )
    return await _state_for(db, sub, session)


async def unrank(db: AsyncIOMotorDatabase, sub: str, item_id: int) -> None:
    """Drop a ranking, then respread whatever is left of that tier."""
    row = await db.rankings.find_one_and_delete({"sub": sub, "item_id": item_id})
    if not row:
        return
    await db.rank_sessions.delete_many({"sub": sub})
    item = await db.items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        return
    pool = await _tier_pool(db, sub, item["city"], row["tier"], item_id)
    await _rescore(db, sub, row['tier'], pool)
