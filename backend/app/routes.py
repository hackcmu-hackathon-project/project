from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from . import itinerary, people, photos, ranking, social
from .auth import Principal, current_user
from .db import get_db
from .models import (
    CATEGORIES,
    Activity,
    City,
    Comment,
    CommentCreate,
    ReactionSet,
    FeedEntry,
    Item,
    ItemCreate,
    Category,
    NoteUpdate,
    ProfileUpdate,
    PublicUser,
    RankCompare,
    RankStart,
    RankState,
    Ranking,
)

router = APIRouter(prefix="/api")

CITIES = {"sf": "San Francisco", "nyc": "New York"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ago(when: datetime | None) -> str:
    """Human-scale relative time, in the style the feed already uses."""
    if when is None:
        return "just now"
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    seconds = max(0, int((_now() - when).total_seconds()))
    if seconds < 90:
        return "just now"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h"
    if seconds < 172800:
        return "Yesterday"
    return f"{seconds // 86400}d"


async def _touch_user(db: AsyncIOMotorDatabase, user: Principal) -> dict:
    """First call for a given Auth0 sub is effectively the sign-up."""
    handle = await people.ensure_handle(db, user.sub, user.name, user.email)
    await db.users.update_one(
        {"_id": user.sub},
        {
            "$set": {
                "name": user.name,
                "email": user.email,
                "picture": user.picture,
                "handle": handle,
                "last_seen_at": _now(),
            },
            "$setOnInsert": {"created_at": _now(), "color": "#8a2d6e", "bio": ""},
        },
        upsert=True,
    )
    return await db.users.find_one({"_id": user.sub})


# --------------------------------------------------------------------------- me


@router.get("/me")
async def me(user: Principal = Depends(current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await _touch_user(db, user)
    counts: dict[str, int] = {}
    for city in CITIES:
        counts[city] = len(await ranking.ranked_items(db, user.sub, city))
    return {
        "sub": doc["_id"],
        "name": doc["name"],
        "handle": doc.get("handle"),
        "email": doc.get("email"),
        "picture": doc.get("picture"),
        "bio": doc.get("bio", ""),
        "ranked": counts,
        "following": await db.follows.count_documents({"follower": user.sub}),
        "followers": await db.follows.count_documents({"followee": user.sub}),
        "new_user": doc.get("created_at") == doc.get("last_seen_at"),
    }


@router.patch("/me")
async def update_me(
    body: ProfileUpdate,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "handle" in patch:
        taken = await db.users.find_one({"handle": patch["handle"], "_id": {"$ne": user.sub}}, {"_id": 1})
        if taken:
            raise HTTPException(status.HTTP_409_CONFLICT, "That handle is taken")
    if patch:
        await db.users.update_one({"_id": user.sub}, {"$set": patch})
    return await db.users.find_one({"_id": user.sub})


# ----------------------------------------------------------------------- people


@router.get("/people", response_model=list[PublicUser])
async def search_people(
    q: str | None = Query(None, description="Name or @handle"),
    limit: int = 25,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Search everyone; with no query, suggest the most-followed people you don't follow."""
    await _touch_user(db, user)
    if q:
        needle = q.lstrip("@")
        query = {
            "_id": {"$ne": user.sub},
            "$or": [
                {"name": {"$regex": needle, "$options": "i"}},
                {"handle": {"$regex": needle, "$options": "i"}},
            ],
        }
        docs = await db.users.find(query).limit(limit).to_list(limit)
    else:
        mine = await people.following_subs(db, user.sub)
        docs = await db.users.find({"_id": {"$nin": [*mine, user.sub]}}).limit(limit).to_list(limit)
    return await people.hydrate(db, docs, user.sub)


@router.get("/people/following", response_model=list[PublicUser])
async def my_following(
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    subs = await people.following_subs(db, user.sub)
    docs = await db.users.find({"_id": {"$in": subs}}).to_list(500)
    return await people.hydrate(db, docs, user.sub)


@router.get("/people/{sub}/rankings")
async def person_rankings(
    sub: str,
    city: City | None = None,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Someone else's ranked list. Declared before the catch-all /people/{sub}."""
    rows = await ranking.ranked_items(db, sub, city)
    return [
        {"item_id": r["item_id"], "tier": r["tier"], "score": r["score"], "note": r.get("note"), "item": r["item"]}
        for r in rows
    ]


@router.get("/people/{sub:path}", response_model=PublicUser)
async def get_person(
    sub: str,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await db.users.find_one({"_id": sub})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such person")
    return (await people.hydrate(db, [doc], user.sub))[0]


@router.put("/people/{sub:path}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow_person(
    sub: str,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not await db.users.find_one({"_id": sub}, {"_id": 1}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such person")
    await people.follow(db, user.sub, sub)


@router.delete("/people/{sub:path}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_person(
    sub: str,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await people.unfollow(db, user.sub, sub)


# ------------------------------------------------------------------------ items


@router.get("/cities")
async def cities(db: AsyncIOMotorDatabase = Depends(get_db)):
    """The only two cities Rove supports."""
    out = []
    for key, name in CITIES.items():
        out.append({"key": key, "name": name, "items": await db.items.count_documents({"city": key})})
    return out


@router.get("/categories")
async def categories(city: City | None = None, db: AsyncIOMotorDatabase = Depends(get_db)):
    """The fixed category list, with how many things each holds."""
    match = {"city": city} if city else {}
    rows = await db.items.aggregate(
        [{"$match": match}, {"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    ).to_list(20)
    counts = {r["_id"]: r["count"] for r in rows}
    return [{"category": c, "count": counts.get(c, 0)} for c in CATEGORIES]


@router.get("/items", response_model=list[Item])
async def list_items(
    city: City | None = None,
    category: Category | None = None,
    q: str | None = Query(None, description="Substring match on title, neighborhood or tag"),
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {}
    if city:
        query["city"] = city
    if category:
        query["category"] = category
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"hood": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.items.find(query, {"_id": 0}).sort("id", 1).skip(offset).limit(limit).to_list(limit)
    return [Item(**d) for d in docs]


@router.get("/items/{item_id}", response_model=Item)
async def get_item(item_id: int, db: AsyncIOMotorDatabase = Depends(get_db)):
    return await ranking.item_or_404(db, item_id)


@router.get("/items/{item_id}/rankings")
async def item_rankings(
    item_id: int,
    scope: str = Query("following", pattern="^(following|everyone)$"),
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Who else has ranked this, and what they gave it."""
    if scope == "following":
        subs = await people.following_subs(db, user.sub)
    else:
        subs = [d["_id"] for d in await db.users.find({"_id": {"$ne": user.sub}}, {"_id": 1}).to_list(500)]
    if not subs:
        return []
    rows = await db.rankings.find({"item_id": item_id, "sub": {"$in": subs}}, {"_id": 0}).sort("score", -1).to_list(200)
    profiles = await db.users.find({"_id": {"$in": [r["sub"] for r in rows]}}).to_list(200)
    by_sub = {p["_id"]: p for p in profiles}
    return [
        {
            "sub": r["sub"],
            "name": by_sub.get(r["sub"], {}).get("name", "Someone"),
            "color": by_sub.get(r["sub"], {}).get("color", "#8a2d6e"),
            "score": r["score"],
            "tier": r["tier"],
            "note": r.get("note"),
        }
        for r in rows
    ]


@router.post("/items", response_model=Item, status_code=status.HTTP_201_CREATED)
async def create_item(
    body: ItemCreate,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # Ids 1-99 are the hand-written seed and 1,000,000+ are Wikipedia imports,
    # so places added in the app take the next free id from 100 up.
    last = await db.items.find_one({"id": {"$lt": 1_000_000}}, sort=[("id", -1)], projection={"id": 1})
    doc = {
        **body.model_dump(),
        "id": max(99, last["id"] if last else 99) + 1,
        "img": "photo",
        "created_by": user.sub,
        "created_at": _now(),
    }
    photo = await photos.find_photo(photos.photo_query_for(doc))
    if photo:
        doc.update(photo)
    await db.items.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("created_at", None)
    doc.pop("photo_query", None)
    return Item(**doc)


# --------------------------------------------------------------------- rankings


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: int,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Remove a place you added, as long as nobody (including you) has ranked it."""
    item = await db.items.find_one({"id": item_id}, {"created_by": 1})
    if not item:
        return
    if item.get("created_by") != user.sub:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only whoever added it can remove it")
    if await db.rankings.count_documents({"item_id": item_id}):
        raise HTTPException(status.HTTP_409_CONFLICT, "Somebody has ranked this — it stays")
    await db.items.delete_one({"id": item_id})
    await db.saves.delete_many({"item_id": item_id})


@router.get("/rankings")
async def my_rankings(
    city: City | None = None,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    rows = await ranking.ranked_items(db, user.sub, city)
    return [
        {
            "item_id": r["item_id"],
            "tier": r["tier"],
            "score": r["score"],
            "note": r.get("note"),
            "item": r["item"],
        }
        for r in rows
    ]


@router.post("/rank/start", response_model=RankState)
async def rank_start(
    body: RankStart,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await ranking.start(db, user.sub, body.item_id, body.tier)


@router.post("/rank/compare", response_model=RankState)
async def rank_compare(
    body: RankCompare,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await ranking.compare(db, user.sub, body.session_id, body.winner)


@router.patch("/rankings/{item_id}", response_model=Ranking)
async def set_note(
    item_id: int,
    body: NoteUpdate,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    row = await db.rankings.find_one_and_update(
        {"sub": user.sub, "item_id": item_id},
        {"$set": {"note": body.note, "updated_at": _now()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not ranked yet")
    return Ranking(**row)


@router.delete("/rankings/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ranking(
    item_id: int,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await ranking.unrank(db, user.sub, item_id)


# ------------------------------------------------------------------------- feed


# ------------------------------------------------------------------ want to go


@router.get("/saves", response_model=list[Item])
async def my_saves(
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    ids = await social.saved_ids(db, user.sub)
    if not ids:
        return []
    docs = await db.items.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    by_id = {d["id"]: d for d in docs}
    return [Item(**by_id[i]) for i in ids if i in by_id]


@router.put("/saves/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def save_item(
    item_id: int,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Add to want-to-go. You can't want to go somewhere you've already ranked."""
    await ranking.item_or_404(db, item_id)
    if await db.rankings.find_one({"sub": user.sub, "item_id": item_id}, {"_id": 1}):
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already ranked this")
    await social.save(db, user.sub, item_id)


@router.delete("/saves/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_item(
    item_id: int,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await social.unsave(db, user.sub, item_id)


# ------------------------------------------------------------------- activity


@router.get("/activity/{owner}/{item_id}", response_model=Activity)
async def get_activity(
    owner: str,
    item_id: int,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """One person's ranking of one item, with its reactions and comments."""
    row = await db.rankings.find_one({"sub": owner, "item_id": item_id}, {"_id": 0})
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That ranking is gone")
    item = await ranking.item_or_404(db, item_id)
    person = await db.users.find_one({"_id": owner}) or {}
    city_rows = await ranking.ranked_items(db, owner, item.city)
    rank = next((i + 1 for i, r in enumerate(city_rows) if r["item_id"] == item_id), None)
    summary = (await social.reaction_summary(db, [social.post_id(owner, item_id)], user.sub)).get(
        social.post_id(owner, item_id), {"counts": {}, "mine": None}
    )
    return Activity(
        owner_sub=owner,
        owner_name=person.get("name", "Someone"),
        owner_handle=person.get("handle", ""),
        owner_color=person.get("color", "#8a2d6e"),
        item=item,
        tier=row["tier"],
        score=row["score"],
        note=row.get("note") or "",
        when=_ago(row.get("updated_at")),
        rank=rank,
        total=len(city_rows),
        reactions=summary["counts"],
        my_reaction=summary["mine"],
        comments=await social.comments_for(db, owner, item_id, user.sub),
    )


@router.put("/activity/{owner}/{item_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
async def set_reaction(
    owner: str,
    item_id: int,
    body: ReactionSet,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if body.emoji not in social.EMOJI:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported reaction")
    await social.react(db, user.sub, owner, item_id, body.emoji)


@router.delete("/activity/{owner}/{item_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
async def clear_reaction(
    owner: str,
    item_id: int,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await social.unreact(db, user.sub, owner, item_id)


@router.post("/activity/{owner}/{item_id}/comments", response_model=Comment, status_code=status.HTTP_201_CREATED)
async def add_comment(
    owner: str,
    item_id: int,
    body: CommentCreate,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not await db.rankings.find_one({"sub": owner, "item_id": item_id}, {"_id": 1}):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That ranking is gone")
    await _touch_user(db, user)
    cid = await social.add_comment(db, user.sub, owner, item_id, body.text)
    comments = await social.comments_for(db, owner, item_id, user.sub)
    return next(c for c in comments if c.id == cid)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_comment(
    comment_id: str,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """You can only delete your own comments."""
    if not await social.delete_comment(db, user.sub, comment_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your comment")


@router.get("/emoji")
async def emoji_palette():
    return social.EMOJI


@router.get("/feed", response_model=list[FeedEntry])
async def feed(
    scope: str = Query("following", pattern="^(following|everyone)$"),
    limit: int = 30,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Rankings by the people you follow (or everyone), newest first.

    Empty until you follow someone — the app turns that into a prompt to go find
    people rather than inventing activity.
    """
    if scope == "following":
        subs = await people.following_subs(db, user.sub)
    else:
        subs = [d["_id"] for d in await db.users.find({"_id": {"$ne": user.sub}}, {"_id": 1}).to_list(500)]

    entries: list[FeedEntry] = []

    if subs:
        rows = await db.rankings.find({"sub": {"$in": subs}}, {"_id": 0}).sort("updated_at", -1).to_list(limit * 3)
        profiles = await db.users.find({"_id": {"$in": subs}}).to_list(500)
        by_sub = {p["_id"]: p for p in profiles}
        items = await db.items.find({"id": {"$in": [r["item_id"] for r in rows]}}, {"_id": 0}).to_list(500)
        by_id = {i["id"]: i for i in items}

        posts = [social.post_id(r["sub"], r["item_id"]) for r in rows]
        summary = await social.reaction_summary(db, posts, user.sub)
        counts = await social.comment_counts(db, posts)
        saved = set(await social.saved_ids(db, user.sub))

        seen: dict[str, int] = {}
        for r in rows:
            item = by_id.get(r["item_id"])
            if not item:
                continue
            # Keep one prolific person from flooding the feed.
            seen[r["sub"]] = seen.get(r["sub"], 0) + 1
            if seen[r["sub"]] > 4:
                continue
            person = by_sub.get(r["sub"], {})
            entries.append(
                FeedEntry(
                    id=f"live-{r['sub']}-{r['item_id']}",
                    user_sub=r["sub"],
                    user_name=person.get("name", "Someone"),
                    user_picture=person.get("picture"),
                    user_color=person.get("color", "#3b5b8c"),
                    item=Item(**item),
                    score=r["score"],
                    tier=r["tier"],
                    action="ranked",
                    time=_ago(r.get("updated_at")),
                    note=r.get("note") or "",
                    img=item.get("img", "photo"),
                    reactions=summary.get(social.post_id(r["sub"], r["item_id"]), {}).get("counts", {}),
                    my_reaction=summary.get(social.post_id(r["sub"], r["item_id"]), {}).get("mine"),
                    likes=sum(summary.get(social.post_id(r["sub"], r["item_id"]), {}).get("counts", {}).values()),
                    comments=counts.get(social.post_id(r["sub"], r["item_id"]), 0),
                    saved=item["id"] in saved,
                )
            )

    return entries[:limit]


@router.post("/itineraries/generate")
async def generate_itinerary(
    body: itinerary.ItineraryRequest,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    items = await db.items.find({"city": body.city}, {"_id": 0}).to_list(None)
    saved = await db.saves.find({"sub": user.sub}).to_list(None)
    visited = await db.rankings.find({"sub": user.sub}).to_list(None)
    subs = await people.following_subs(db, user.sub)
    recommendations = await db.rankings.find({"sub": {"$in": subs}, "score": {"$gte": 5}}).to_list(None)
    users = await db.users.find({"_id": {"$in": subs}}).to_list(None)
    names = {u["_id"]: u.get("name", "A friend") for u in users}
    try:
        return itinerary.build_itinerary(
            body, items, {s["item_id"] for s in saved}, {r["item_id"] for r in visited},
            [{**r, "name": names.get(r["sub"], "A friend")} for r in recommendations],
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
