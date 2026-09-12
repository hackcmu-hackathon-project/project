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
.venv/bin/python seed.py --demo-user --dev-user --reset
.venv/bin/uvicorn app.main:app --port 8010 --reload

# 3. App
cd .. && npm install
cp .env.example .env
npm run web        # a phone frame appears on wide screens
```

Auth0 is optional. With `AUTH0_DOMAIN` unset the API runs **open in dev mode** and
attributes every request to a single local user, so you can build without it. If the
API is unreachable the app says so and falls back to bundled seed data, still fully
interactive but saving nothing.

## API

`GET /docs` has the live schema. The interesting part is that ranking is a
**server-side session**, not a client calculation:

| route | what it does |
| --- | --- |
| `GET /api/items?city=&q=` | the catalogue |
| `POST /api/items` | add an experience (sf/nyc only) |
| `POST /api/rank/start` | `{item_id, tier}` → first duel, or a final score if the tier is empty |
| `POST /api/rank/compare` | `{session_id, winner}` → next duel, or the placement |
| `GET /api/rankings` | your list, best first, joined to items |
| `PATCH /api/rankings/{id}` | attach a note |
| `DELETE /api/rankings/{id}` | unrank, and respread the tier |
| `GET /api/feed?scope=` | rankings by the people you follow (`following`, default) or everyone |
| `GET /api/me` | upserts your profile — the first call for an Auth0 sub *is* the sign-up |
| `PATCH /api/me` | change name, @handle or bio |
| `GET /api/people?q=` | search by name or @handle; with no query, suggests people to follow |
| `GET /api/people/following` | who you follow |
| `PUT/DELETE /api/people/{sub}/follow` | follow / unfollow |

**Collections**

| collection | shape |
| --- | --- |
| `items` | `{ id, city, title, hood, stops, hours, note, stops_list[], created_by }` |
| `users` | `{ _id: auth0 sub, name, email, picture, color, created_at, last_seen_at }` |
| `rankings` | `{ sub, item_id, tier, score, note, updated_at }` — unique on `(sub, item_id)` |
| `rank_sessions` | in-flight comparisons, TTL 1 hour |
| `follows` | `{ _id: "follower→followee", follower, followee, created_at }` |
| `feed_seed` | curated activity, shown only to someone who follows nobody yet |

## Accounts and following

Sign-up and sign-in are both Auth0 Universal Login — "Create an account" opens it with
`screen_hint=signup`, "I already have one" without. There is no separate sign-up form to
maintain: the first `GET /api/me` for a new Auth0 `sub` creates the user document and
assigns an `@handle` derived from their email, deduplicated.

Your feed is exactly the people you follow. **You → Find people** searches every account
by name or handle and suggests people you don't follow yet; follows are optimistic in
the UI and idempotent on the server. Follow nobody and the feed falls back to curated
seed activity rather than showing you an empty screen.

Without Auth0 configured the backend runs open and everything is attributed to one local
dev account — the social graph still works, against the seeded accounts.

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
