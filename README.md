# Rove

Rank the days you actually had. Rove is a Beli-style ranking app for *experiences and
itineraries* — you log something you did, say roughly how it went, then answer a few
head-to-head comparisons. Scores are relative, so a 9.4 means something: you put it
above everything else.

Two cities, on purpose: **San Francisco** and **New York**. That constraint is enforced
end to end — the API's `City` type is `"sf" | "nyc"`, so nothing else can be created.

```
.
├── App.tsx, src/      Expo app (iOS, Android, web)
└── backend/           FastAPI + MongoDB API
```

## Run it

Three processes. Mongo and the API first, then the app.

```bash
# 1. MongoDB
cd backend && docker compose up -d

# 2. API  (http://localhost:8010, docs at /docs)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python seed.py --demo-people --dev-user --reset
.venv/bin/python fetch_places.py --per-city 100   # ~100 real places per city
.venv/bin/uvicorn app.main:app --port 8010 --reload

# 3. App
cd .. && npm install
cp .env.example .env
npm run web        # a phone frame appears on wide screens
```

Auth0 is optional in development. With `AUTH0_DOMAIN` unset the API runs **open** and
attributes every request to a single local user, so you can build without it — and
refuses to start that way if `ENV=production`. If the API is unreachable the app says
so, offers a retry, and falls back to the bundled catalogue: browsable, but nothing is
saved and nothing is pre-ranked.

Testing on a phone? `localhost` means the phone, so point
`EXPO_PUBLIC_API_URL` at your machine's LAN address (e.g. `http://192.168.1.20:8010`)
and add that origin to `CORS_ORIGINS` in `backend/.env`.

## API

`GET /docs` has the live schema. The interesting part is that ranking is a
**server-side session**, not a client calculation:

| route | what it does |
| --- | --- |
| `GET /api/items?city=&category=&q=` | the catalogue |
| `POST /api/items` | add a place (sf/nyc only); a photo is resolved for it on the way in |
| `GET /api/categories` | the fixed category list with counts |
| `GET /api/saves`, `PUT/DELETE /api/saves/{id}` | your want-to-go list |
| `GET /api/activity/{sub}/{item}` | one person's ranking with its reactions and comments |
| `PUT/DELETE .../reaction` | set or clear your emoji |
| `POST .../comments`, `DELETE /api/comments/{id}` | comment, and delete your own |
| `POST /api/rank/start` | `{item_id, tier}` → first duel, or a final score if the tier is empty |
| `POST /api/rank/compare` | `{session_id, winner}` → next duel, or the placement |
| `GET /api/rankings` | your list, best first, joined to items |
| `PATCH /api/rankings/{id}` | attach a note |
| `DELETE /api/rankings/{id}` | unrank, and respread the tier |
| `GET /api/items/{id}/rankings` | how the people you follow scored this |
| `GET /api/feed?scope=` | rankings by the people you follow (`following`, default) or everyone |
| `GET /api/me` | upserts your profile — the first call for an Auth0 sub *is* the sign-up |
| `PATCH /api/me` | change name, @handle or bio |
| `GET /api/people?q=` | search by name or @handle; with no query, suggests people to follow |
| `GET /api/people/following` | who you follow |
| `PUT/DELETE /api/people/{sub}/follow` | follow / unfollow |

**Collections**

| collection | shape |
| --- | --- |
| `items` | `{ id, city, title, hood, category, duration_min, price, note, tip, tags[], photo_* }` |
| `users` | `{ _id: auth0 sub, name, email, picture, color, created_at, last_seen_at }` |
| `rankings` | `{ sub, item_id, tier, score, note, updated_at }` — unique on `(sub, item_id)` |
| `rank_sessions` | in-flight comparisons, TTL 1 hour |
| `follows` | `{ _id: "follower→followee", follower, followee, created_at }` |
| `saves` | want-to-go, `{ sub, item_id }` |
| `reactions` | one emoji per person per post, `{ actor, post: "sub#item", emoji }` |
| `comments` | `{ post, author, text, created_at }` |

## What you can do in the app

| | |
| --- | --- |
| **Feed** | Rankings from the people you follow, or everyone. React with an emoji, save a place, or open a take to comment. |
| **Lists** | Your ranked list per city, and your want-to-go list. |
| **＋** | Search the catalogue, or add a place that isn't in it (in either city), then rank it. |
| **Explore** | Search and filter the whole catalogue, browse by category and neighborhood. |
| **You** | Edit your name, @handle and bio; see your circle; find people. |
| **A place** | Your score and rank, how the people you follow scored it, the tip, the source, and a way to re-rank or drop it. |

Your taste tags on the profile are computed from what you've actually ranked, not
stored anywhere.

## Reactions, comments and saves

A "post" is a person's ranking of an item, addressed by `(sub, item_id)` — there
is no separate post document to keep in sync. Reactions are one emoji per person
per post from a fixed palette; comments are a flat thread, and you can only
delete your own. Both are optimistic in the UI. "Want to go" saves an item to
your list, which is what the Lists tab's second section shows.

## Deploying the API

`backend/Dockerfile` builds the service; it runs one uvicorn worker and expects
`MONGODB_URI`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `CORS_ORIGINS` and `ENV=production`
in the environment. Ranking sessions live in MongoDB rather than in memory, so you can
run as many replicas as you like behind a load balancer. `GET /health` does a real
database round-trip and reports which auth mode is active — point your health check at
it.

## Checking it works

```bash
cd backend && .venv/bin/python smoke_test.py
```

Exercises every endpoint against a running API as the dev user — catalogue,
search, creating a place, a full ranking session, saves, follows, reactions,
comments — and cleans up after itself. 30 checks; it prints what failed.

## Accounts and following

Sign-up and sign-in are both Auth0 Universal Login — "Create an account" opens it with
`screen_hint=signup`, "I already have one" without. There is no separate sign-up form to
maintain: the first `GET /api/me` for a new Auth0 `sub` creates the user document and
assigns an `@handle` derived from their email, deduplicated.

Your feed is exactly the people you follow — nothing is invented to fill it. **You →
Find people** searches every account by name or handle and suggests people you don't
follow yet; follows are optimistic in the UI and idempotent on the server. Follow nobody
and the feed says so and points you at search.

Without Auth0 configured the backend runs open and everything is attributed to one local
dev account — the social graph still works, against the seeded accounts.

## The catalogue

Two cities, about a hundred things to do in each, plus a hand-written core.

* `backend/seed_data.json` — cities and ~16 curated items, each with a real
  description, a tip and a best time. Regenerate the app's offline copy with
  `npm run gen:seed`.
* `python fetch_places.py --per-city 100` — imports well-known places from
  Wikipedia: geosearch around each city, filtered to things you'd actually go do
  and ranked by how many language editions carry the article. Neighborhoods come
  from coordinates, photos from the article's lead image. Imported ids start at
  1000 so they never collide with the curated set.
* `python fetch_photos.py` — fills in photos for anything still missing one,
  from [Openverse](https://openverse.org) (openly licensed, no API key). Credit
  and license travel with the URL and are shown on the detail screen.
* Anything missing, you add in the app: **＋ → Add a new place** writes to the
  catalogue for everyone and resolves a photo on the way in.

Categories are a fixed constant in two places that must agree —
`CATEGORIES` in `backend/app/models.py` and in `src/theme.ts`. There is
deliberately no Food or Drink: restaurants and bars are Beli's job, and Rove is
about things to do.

## How ranking works

Three tiers map to score bands — loved `8–10`, liked `5–7.9`, fine `2–4.9`. A new entry
is placed inside its tier by binary-search comparisons (~`log₂ n` of them), then every
score in that tier is respread evenly across the band. One new ranking therefore
rewrites its whole tier, which is why placement lives on the server: the client only
answers "which was better?" and is told where the entry landed. Unranking respreads the
tier too.

## Auth0 setup

1. Applications → Create → **Native**. Put the domain and client ID in `.env`.
2. Allowed Callback + Logout URLs: `rove://*` and `http://localhost:8081`.
3. APIs → create one with identifier `https://rove.api` (RS256). Use that value for
   both `EXPO_PUBLIC_AUTH0_AUDIENCE` and the backend's `AUTH0_AUDIENCE`, and set
   `AUTH0_DOMAIN` in `backend/.env` to switch the API from dev mode to real verification.

## Design

The visual language comes from the Claude Design canvas (`Rove.dc.html`): Instrument
Serif display type on a warm paper ground, plum/gold score dots, hatched photo slots,
floating pill tab bar. `backend/seed_data.json` is generated from that same source, so
the design and the seeded content stay in sync.
