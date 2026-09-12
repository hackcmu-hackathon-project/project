"""Deterministic preference-first day planning; no invented hours or travel times."""
from datetime import date, timedelta
from typing import Literal
from urllib.parse import urlencode

from pydantic import BaseModel, Field, model_validator

from .models import CITY_NAMES, City, Item


class ItineraryRequest(BaseModel):
    city: City
    start_date: date
    end_date: date
    use_gemini: bool = False
    preferences: str = Field("", max_length=1000)
    must_try_ids: list[int] = Field(default_factory=list, max_length=100)
    stops_per_day: int = Field(3, ge=1, le=5)
    travel_mode: Literal["walking", "driving", "bicycling"] = "walking"

    @model_validator(mode="after")
    def valid_dates(self):
        if not 0 <= (self.end_date - self.start_date).days < 14:
            raise ValueError("Choose an end date on or after the start, up to 14 days total.")
        return self


def maps_url(items: list[dict], city: str, mode: str) -> str | None:
    if not items:
        return None
    city_name = CITY_NAMES[city]
    # Coordinates when we have them: a place somebody added by hand may not be
    # findable by name, and an imported one is pinned exactly.
    places = [
        f'{i["lat"]},{i["lon"]}' if i.get("lat") and i.get("lon")
        else f'{i["title"]}, {i["hood"]}, {city_name}'
        for i in items
    ]
    params = {"api": "1", "destination": places[-1], "travelmode": mode}
    if len(places) > 1:
        params["origin"] = places[0]
    if len(places) > 2:
        params["waypoints"] = "|".join(places[1:-1])
    return "https://www.google.com/maps/dir/?" + urlencode(params)


def build_itinerary(body: ItineraryRequest, items: list[dict], saved: set[int], visited: set[int], recommendations: list[dict]):
    catalogue = {i["id"]: i for i in items if i["city"] == body.city}
    must = set(body.must_try_ids)
    if must - catalogue.keys():
        raise ValueError("Some must-tries are unavailable in this city. Refresh and select again.")
    friends: dict[int, dict[str, str]] = {}
    for r in recommendations:
        if r["score"] >= 5:
            friends.setdefault(r["item_id"], {})[r["sub"]] = r.get("name", "A friend")
    candidates = []
    for id, item in catalogue.items():
        if id not in must and (id in visited or (id not in saved and id not in friends)):
            continue
        names = list(friends.get(id, {}).values())
        reasons = (["Your must-try"] if id in must else []) + (["On your want-to-go list"] if id in saved else [])
        if names:
            reasons.append("Recommended by " + ", ".join(names))
        candidates.append({"item": Item(**item).model_dump(), "reasons": reasons,
                           "priority": (id in must, id in saved, len(names)), "id": id})
    candidates.sort(key=lambda c: (*[-int(x) for x in c["priority"]], c["id"]))
    count = (body.end_date - body.start_date).days + 1
    selected = candidates[:count * body.stops_per_day]
    remaining = selected.copy()
    days = []
    for offset in range(count):
        stops = []
        # Start with the highest priority remaining pick, then group its neighborhood.
        while remaining and len(stops) < body.stops_per_day:
            index = next((n for n, c in enumerate(remaining) if stops and c["item"]["hood"] == stops[-1]["item"]["hood"]), 0)
            stops.append(remaining.pop(index))
        day_items = [s["item"] for s in stops]
        days.append({"date": (body.start_date + timedelta(days=offset)).isoformat(),
                     "stops": [{"item": s["item"], "reasons": s["reasons"]} for s in stops],
                     "activity_minutes": sum(max(0, i["duration_min"]) for i in day_items),
                     "maps_url": maps_url(day_items, body.city, body.travel_mode)})
    return {"days": days, "unscheduled_count": len(candidates) - len(selected),
            "unscheduled_must_try_ids": sorted(must - {c["id"] for c in selected})}


class SavedDay(BaseModel):
    date: date
    item_ids: list[int] = Field(default_factory=list, max_length=5)
    notes: str = Field('', max_length=2000)


class SaveItinerary(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    city: City
    travel_mode: Literal['walking', 'driving', 'bicycling'] = 'walking'
    days: list[SavedDay] = Field(min_length=1, max_length=14)
    revision: int = Field(0, ge=0)

    @model_validator(mode='after')
    def valid_plan(self):
        self.title = self.title.strip()
        if not self.title:
            raise ValueError('Give your trip a name.')
        dates = [d.date for d in self.days]
        if any(b - a != timedelta(days=1) for a, b in zip(dates, dates[1:])):
            raise ValueError('Trip dates must be consecutive and in order.')
        ids = [id for d in self.days for id in d.item_ids]
        if len(ids) != len(set(ids)):
            raise ValueError('A place can only appear once in a trip.')
        return self


def saved_plan(body: SaveItinerary, items: list[dict]) -> dict:
    catalogue = {i['id']: i for i in items if i['city'] == body.city}
    if {id for day in body.days for id in day.item_ids} - catalogue.keys():
        raise ValueError('A place is unavailable or belongs to another city. Remove it before saving.')
    days = []
    for day in body.days:
        places = [Item(**catalogue[id]).model_dump() for id in day.item_ids]
        days.append({'date': day.date.isoformat(), 'notes': day.notes,
                     'stops': [{'item': i, 'reasons': ['Your trip selection']} for i in places],
                     'activity_minutes': sum(max(0, i['duration_min']) for i in places),
                     'maps_url': maps_url(places, body.city, body.travel_mode)})
    return {'title': body.title, 'city': body.city, 'travel_mode': body.travel_mode, 'days': days}
