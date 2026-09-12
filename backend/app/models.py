from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Tier = Literal["loved", "liked", "okay"]
#: Rove supports exactly two cities.
City = Literal["sf", "nyc"]
#: Rove is about things to *do*. Restaurants and bars are Beli's job.
CATEGORIES = ("Outdoors", "Culture", "Landmark", "Music", "Nightlife", "Sports", "Shop")
Category = Literal["Outdoors", "Culture", "Landmark", "Music", "Nightlife", "Sports", "Shop"]

#: Score band for each tier. A tier's members are spread evenly across its band.
TIER_BANDS: dict[str, tuple[float, float]] = {
    "loved": (8.0, 10.0),
    "liked": (5.0, 7.9),
    "okay": (2.0, 4.9),
}


class Item(BaseModel):
    """One thing to do in one city — a meal, a walk, a set, a view."""

    id: int
    city: City
    title: str
    hood: str
    category: Category = "Culture"
    duration_min: int = 60
    price: int = Field(0, ge=0, le=3, description="0 free … 3 expensive")
    best_time: str = ""
    note: str = ""
    tip: str = ""
    tags: list[str] = Field(default_factory=list)
    img: str = "photo"
    # Resolved once from Openverse; see app/photos.py.
    photo_url: str | None = None
    photo_thumb: str | None = None
    photo_credit: str | None = None
    photo_license: str | None = None
    photo_source_url: str | None = None
    photo_provider: str | None = None
    #: Set on places imported from Wikipedia.
    wikipedia_url: str | None = None
    created_by: str | None = None


class ItemCreate(BaseModel):
    city: City
    title: str
    hood: str
    category: Category = "Culture"
    duration_min: int = 60
    price: int = Field(0, ge=0, le=3)
    best_time: str = ""
    note: str = ""
    tip: str = ""
    tags: list[str] = Field(default_factory=list)


class Ranking(BaseModel):
    item_id: int
    tier: Tier
    score: float
    note: str | None = None
    updated_at: datetime | None = None


class RankStart(BaseModel):
    item_id: int
    tier: Tier


class RankCompare(BaseModel):
    session_id: str
    winner: Literal["new", "opponent"]


class RankState(BaseModel):
    """Where a ranking session stands: another duel, or a finished score."""

    session_id: str
    done: bool
    comparison: int = 0
    opponent: Item | None = None
    opponent_rank: int | None = None
    opponent_score: float | None = None
    item: Item | None = None
    score: float | None = None
    rank: int | None = None
    total: int | None = None


class NoteUpdate(BaseModel):
    note: str


class PublicUser(BaseModel):
    """Another person, as seen by the caller."""

    sub: str
    name: str
    handle: str
    picture: str | None = None
    color: str = "#8a2d6e"
    bio: str = ""
    ranked: int = 0
    followers: int = 0
    following: bool = False
    top_pick: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = None
    handle: str | None = None
    bio: str | None = None


class Comment(BaseModel):
    id: str
    author_sub: str
    author_name: str
    author_color: str = "#8a2d6e"
    text: str
    created_at: datetime
    mine: bool = False


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=600)


class ReactionSet(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)


class Activity(BaseModel):
    """One person's ranking of one item, plus everything attached to it."""

    owner_sub: str
    owner_name: str
    owner_handle: str
    owner_color: str
    item: Item
    tier: Tier
    score: float
    note: str = ""
    when: str = ""
    rank: int | None = None
    total: int | None = None
    reactions: dict[str, int] = Field(default_factory=dict)
    my_reaction: str | None = None
    comments: list[Comment] = Field(default_factory=list)


class FeedEntry(BaseModel):
    id: str
    user_sub: str | None = None
    user_name: str
    user_picture: str | None = None
    user_color: str = "#8a2d6e"
    item: Item
    score: float
    tier: Tier
    action: str
    time: str
    likes: int = 0
    comments: int = 0
    note: str = ""
    img: str = "photo"
    reactions: dict[str, int] = Field(default_factory=dict)
    my_reaction: str | None = None
    saved: bool = False
    suggested: bool = False
