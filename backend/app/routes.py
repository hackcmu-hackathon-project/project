from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from . import agent, geocode, gemini_planner, itinerary, people, photos, ranking, ranking_photos, social, uploads
from .auth import Principal, current_user
from .db import get_db
from .models import (
    CATEGORIES,
    CITY_NAMES,
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
router.include_router(ranking_photos.router)

CITIES = CITY_NAMES


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


@router.get("/places/suggest")
async def suggest_places(q: str, city: City):
    """Type-ahead for the address field."""
    return await geocode.suggest(q, city)


@router.get("/geocode")
async def geocode_address(q: str, city: City):
    """Where an address lands, so the form can show it on a map before saving."""
    found = await geocode.describe(q, city)
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No match in {CITY_NAMES[city]}")
    return found


@router.get("/cities/{city}/neighborhoods")
async def city_neighborhoods(city: City):
    """The neighborhoods we can label a place with, so nobody has to guess."""
    from neighborhoods import HOODS

    return sorted(name for name, _, _ in HOODS.get(city, []))


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
    # A place nobody can route to is barely a place. Trust the point the app
    # showed on the map — someone may have dragged the pin to correct it — and
    # only geocode when it didn't send one.
    found = (doc["lat"], doc["lon"]) if doc.get("lat") and doc.get("lon") else None
    found = found or await geocode.locate(doc.get("address", ""), doc["city"])
    if not found:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Couldn't find “{doc.get('address') or 'that address'}” in {CITY_NAMES[doc['city']]}. "
            "Try a street address or a nearby cross street.",
        )
    doc["lat"], doc["lon"] = found

    # The neighborhood follows from where it is, so nobody has to pick one.
    # Ask OpenStreetMap what the area is actually called rather than measuring
    # to our own centroids: Grove Street is 2km from Battery Park and on the
    # other side of the Hudson. Fall back to the nearest centroid if it can't say.
    if not doc.get("hood"):
        from neighborhoods import HOODS, nearest

        area = await geocode.reverse(doc["lat"], doc["lon"])
        known = {name.lower(): name for name, _, _ in HOODS.get(doc["city"], [])}
        # Prefer our spelling when it's somewhere we already name.
        doc["hood"] = known.get(area.lower(), area) or nearest(doc["city"], doc["lat"], doc["lon"])

    photo = await photos.find_photo(photos.photo_query_for(doc))
    if photo:
        doc.update(photo)
    await db.items.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("created_at", None)
    doc.pop("photo_query", None)
    return Item(**doc)


# --------------------------------------------------------------------- rankings


@router.get("/items/{item_id}/photos")
async def item_photos(item_id: int, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Every picture of this place: the cover first, then people's own photos."""
    item = await ranking.item_or_404(db, item_id)
    photos = []
    # A cover that is itself somebody's photo comes back below, with their name
    # on it; listing it twice would be odd.
    if item.photo_url and not ranking_photos.is_member_photo(item.photo_url):
        photos.append({
            "url": item.photo_url,
            "credit": item.photo_credit or "",
            "source": item.photo_provider or "",
            "by": None,
        })

    rows = await db.rankings.find(
        {"item_id": item_id, "photo_ids": {"$exists": True, "$ne": []}}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    if rows:
        people = await db.users.find({"_id": {"$in": [r["sub"] for r in rows]}}).to_list(200)
        names = {p["_id"]: p.get("name", "Someone") for p in people}
        for row in rows:
            for url in ranking_photos.photo_urls(row):
                photos.append({
                    "url": url,
                    "credit": names.get(row["sub"], "Someone"),
                    "source": "Rove",
                    "by": row["sub"],
                })
    return photos


@router.post("/items/{item_id}/photo", response_model=Item)
async def upload_item_photo(
    item_id: int,
    file: UploadFile = File(...),
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Attach your own photo to a place. Replaces whatever was there."""
    await ranking.item_or_404(db, item_id)
    if file.content_type not in uploads.ACCEPTED:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"{file.content_type} isn't a supported image")

    raw = await file.read()
    if len(raw) > uploads.MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "That image is over 8 MB")

    await uploads.store(db, item_id, raw, user.sub)
    person = await _touch_user(db, user)
    # A cache-busting suffix so a replaced photo doesn't keep serving the old one.
    url = f"/api/items/{item_id}/photo?v={int(_now().timestamp())}"
    await db.items.update_one(
        {"id": item_id},
        {
            "$set": {
                "photo_url": url,
                "photo_thumb": url,
                "photo_credit": person.get("name", "A Rove user"),
                "photo_license": "",
                "photo_provider": "Rove",
                "photo_source_url": None,
            }
        },
    )
    return await ranking.item_or_404(db, item_id)


@router.get("/items/{item_id}/photo")
async def get_item_photo(item_id: int, db: AsyncIOMotorDatabase = Depends(get_db)):
    data = await uploads.read(db, item_id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No uploaded photo")
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000"})


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
    await uploads.remove(db, item_id)


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
    # Their photos went with the ranking; the cover can't keep pointing at them.
    await ranking_photos.refresh_cover(db, item_id)


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
    # Want-to-go never includes somewhere you've been, whatever the saves say.
    ranked = {r["item_id"] for r in await db.rankings.find({"sub": user.sub}, {"item_id": 1}).to_list(1000)}
    ids = [i for i in ids if i not in ranked]
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
        photo_urls=ranking_photos.photo_urls(row),
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


@router.get("/activity/mine")
async def my_activity(
    limit: int = 20,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """What other people have done to your rankings lately."""
    mine = await db.rankings.find({"sub": user.sub}, {"item_id": 1}).to_list(1000)
    posts = [social.post_id(user.sub, r["item_id"]) for r in mine]
    if not posts:
        return []

    reactions = await db.reactions.find({"post": {"$in": posts}, "actor": {"$ne": user.sub}}).sort("at", -1).to_list(limit)
    comments = await db.comments.find({"post": {"$in": posts}, "author": {"$ne": user.sub}}).sort("created_at", -1).to_list(limit)

    actors = list({*(r["actor"] for r in reactions), *(c["author"] for c in comments)})
    people_docs = await db.users.find({"_id": {"$in": actors}}).to_list(200)
    by_sub = {p["_id"]: p for p in people_docs}

    item_ids = [int(p.split("#")[1]) for p in {*(r["post"] for r in reactions), *(c["post"] for c in comments)}]
    items = await db.items.find({"id": {"$in": item_ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(200)
    titles = {i["id"]: i["title"] for i in items}

    events = [
        {
            "kind": "reaction",
            "at": r["at"],
            "who": by_sub.get(r["actor"], {}).get("name", "Someone"),
            "who_sub": r["actor"],
            "color": by_sub.get(r["actor"], {}).get("color", "#8a2d6e"),
            "emoji": r["emoji"],
            "item_id": int(r["post"].split("#")[1]),
            "item_title": titles.get(int(r["post"].split("#")[1]), ""),
            "text": "",
        }
        for r in reactions
    ] + [
        {
            "kind": "comment",
            "at": c["created_at"],
            "who": by_sub.get(c["author"], {}).get("name", "Someone"),
            "who_sub": c["author"],
            "color": by_sub.get(c["author"], {}).get("color", "#8a2d6e"),
            "emoji": "",
            "item_id": int(c["post"].split("#")[1]),
            "item_title": titles.get(int(c["post"].split("#")[1]), ""),
            "text": c["text"],
        }
        for c in comments
    ]
    events.sort(key=lambda e: e["at"], reverse=True)
    for e in events:
        e["when"] = _ago(e.pop("at"))
    return events[:limit]


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


@router.post("/agent/chat")
async def agent_chat(
    body: agent.ChatRequest,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Ask the assistant. Its tools act as you, against your own data."""
    await _touch_user(db, user)
    result = await agent.run(db, user.sub, body)
    return {
        **result,
        "places": [Item(**p) for p in result.get("places", [])],
    }


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
        plan = itinerary.build_itinerary(
            body, items, {s["item_id"] for s in saved}, {r["item_id"] for r in visited},
            [{**r, "name": names.get(r["sub"], "A friend")} for r in recommendations],
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    return plan


@router.get('/itineraries')
async def saved_itineraries(user: Principal = Depends(current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    return await db.itineraries.find({'owner': user.sub}, {'_id': 0, 'owner': 0}).sort('updated_at', -1).to_list(None)


@router.put('/itineraries/{trip_id}')
async def save_itinerary(
    trip_id: str,
    body: itinerary.SaveItinerary,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from uuid import UUID
    from pymongo.errors import DuplicateKeyError
    try:
        trip_id = str(UUID(trip_id))
    except ValueError:
        raise HTTPException(422, 'Invalid trip ID')
    items = await db.items.find({'city': body.city}, {'_id': 0}).to_list(None)
    try:
        plan = itinerary.saved_plan(body, items)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    doc = {**plan, 'id': trip_id, 'owner': user.sub, 'revision': body.revision + 1, 'updated_at': _now()}
    if body.revision == 0:
        try:
            await db.itineraries.insert_one({'_id': trip_id, **doc})
        except DuplicateKeyError:
            raise HTTPException(409, 'Trip already exists. Reopen it before saving.')
    else:
        result = await db.itineraries.replace_one(
            {'_id': trip_id, 'owner': user.sub, 'revision': body.revision}, {'_id': trip_id, **doc})
        if not result.matched_count:
            raise HTTPException(409, 'Trip changed or is unavailable. Reopen it before saving.')
    return {k: v for k, v in doc.items() if k != 'owner'}


@router.delete('/itineraries/{trip_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_itinerary(
    trip_id: str,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Delete one of your own trips. Deleting something already gone is fine."""
    await db.itineraries.delete_one({'_id': trip_id, 'owner': user.sub})


@router.post('/itineraries/verify')
async def verify_itinerary(
    body: itinerary.SaveItinerary,
    user: Principal = Depends(current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Explicit, read-only Gemini review of the current draft; never save implicitly."""
    items = await db.items.find({'city': body.city}, {'_id': 0}).to_list(None)
    try:
        plan = itinerary.saved_plan(body, items)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    request = itinerary.ItineraryRequest(
        city=body.city, start_date=body.days[0].date, end_date=body.days[-1].date,
        stops_per_day=max(1, max(len(d.item_ids) for d in body.days)),
        travel_mode=body.travel_mode, use_gemini=True,
    )
    return await gemini_planner.review_plan(
        {**plan, 'unscheduled_count': 0, 'unscheduled_must_try_ids': []}, request)
