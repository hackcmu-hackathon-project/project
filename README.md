# Rove

Rank the days you actually had. Rove is a Beli-style ranking app for *experiences and
itineraries* — you log something you did, say roughly how it went, then answer a few
head-to-head comparisons. Scores are relative, so a 9.4 means something: you put it
above everything else.

**San Francisco**, **New York** and **Pittsburgh**. Cities are one list —
`CITY_NAMES` on the server, `CITY_KEYS` in the app, generated from
`seed_data.json` — so adding another is data plus neighborhood centroids and
sweep points, not a rewrite.

```
.
├── App.tsx, src/      Expo app (iOS, Android, web)
└── backend/           FastAPI + MongoDB API
```

## Run it

One command brings up all three pieces — Mongo, the API on :8010, the app on :8081 —
and seeds an empty database on the way:

```bash
docker compose up
```

Then, once, for the full catalogue (it pulls ~100 real places per city from
Wikipedia and takes a few minutes):

```bash
docker compose run --rm api python fetch_places.py --per-city 100
```

Prefer to run it natively? `npm run dev` does the same three things with Mongo in
Docker and the API and Metro on your machine:

```bash
python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt
npm install
npm run dev
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
| `POST /api/itineraries/verify` | explicitly request a Gemini review of a draft, without saving |
| `GET /api/itineraries` | your saved trips |
| `PUT /api/itineraries/{uuid}` | create or update a trip with revision checks |
| `POST /api/itineraries/generate` | dates, city, must-tries and pace → personalized daily routes |
| `GET /api/items?city=&category=&q=` | the catalogue |
| `POST /api/items` | add a place (sf/nyc only); a photo is resolved for it on the way in |
| `GET /api/categories` | the fixed category list with counts |
| `POST /api/items/{id}/photo` | upload your own photo (multipart, ≤8 MB) |
| `GET /api/items/{id}/photo` | serve it, immutably cached |
| `DELETE /api/items/{id}` | remove a place you added, if nobody has ranked it |
| `GET /api/saves`, `PUT/DELETE /api/saves/{id}` | your want-to-go list (409 if you've ranked it) |
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
| `photos.*` | GridFS bucket for uploaded photos, keyed by `metadata.item_id` |

## What you can do in the app

| | |
| --- | --- |
| **Feed** | Rankings from the people you follow, or everyone. React with an emoji, save a place, or open a take to comment. |
| **Lists** | Your ranked list per city, and your want-to-go list. |
| **＋** | Search the catalogue, or add a place that isn't in it (in either city), then rank it. |
| **Ask** | An assistant that answers in plain language, using the catalogue, your lists and the people you follow — and can save places or build you a trip. |
| **Explore** | Search and filter the whole catalogue, browse by category and neighborhood. |
| **You** | Edit your name, @handle and bio; see your circle; find people. |
| **A place** | Your score and rank, how the people you follow scored it, the tip, the source, and a way to re-rank or drop it. |

Your taste tags on the profile are computed from what you've actually ranked, not
stored anywhere.

## Plan a trip

Open **Lists → Plan a trip**, choose a city and an inclusive date range (up to 14
days), then select 1–5 stops per day and walking, driving or cycling. Search the
catalogue to mark must-tries. The planner prioritizes those, then want-to-go saves,
then places rated at least 5 by people you follow. Previously ranked places are
excluded unless explicitly selected. Each stop explains why it was chosen.

Days group stops by neighborhood and open in Google Maps with the same stop order
(up to three intermediate waypoints, including on mobile browsers). One-stop days
open directions from your current location. No Maps API key is needed. Places are
matched by name, neighborhood and city; confirm the match in Maps. This is a
neighborhood grouping heuristic, not a shortest-path optimizer. Durations cover
activities only; opening hours, availability and travel times are not verified.
Choose **Edit & save this itinerary** after generating a plan. Rename it, add or
remove places, reorder stops, move them between days, change travel mode, and add
notes for times or reservations. Save it to your account, then reopen it from
**Lists → Plan & saved trips**. Each day allows up to five stops; Maps follows your
edited order. Leaving the editor with unsaved changes offers save or discard.
Concurrent edits are rejected so an older copy cannot overwrite a newer save.
If picks do not fit, the planner reports overflow, including omitted must-tries.

Run planner tests with `cd backend && .venv/bin/python -m unittest test_itinerary test_saved_itinerary -v`.

## Gemini opening-hours review

Create a key in [Google AI Studio](https://aistudio.google.com/apikey), then add it
only to `backend/.env`:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Restart `npm run api` after changing environment settings. Never put this key in
an `EXPO_PUBLIC_*` variable or commit it. Google billing/quota applies to generation
and search grounding. The model can be changed to another Gemini 3 model supporting
Search plus structured output.

Trip generation always uses the deterministic planner in `itinerary.py` and never
calls Gemini. After generating a trip, or while editing a saved trip, tap
**Verify trip** to request Gemini's review. Review appears as a preview: choose
**Apply suggestions** or **Keep my trip**. Applying suggestions does not save;
use **Save itinerary** to persist them. Changing the draft invalidates old review
results. The backend sends selected place names, neighborhoods, dates and durations to
Google, without account identifiers or friends' names. Gemini searches for venue
hours, weekday closures, holidays and reservations, then suggests a timed schedule
with travel buffers. It may suggest moving stops between days or removing unavailable stops with
an explanation. The response includes sources and Google's Search Suggestions.

These are search-informed suggestions, not guaranteed opening hours, live ticket
availability or measured travel times. Unknown or conflicting hours require a venue
check. The server validates dates, catalogue IDs, no repeats, visit durations,
non-overlapping times and daily stop limits. Missing keys, provider errors,
un-grounded results or invalid schedules fall back to the original basic plan.
Review is limited to 20 selected stops and one 75-second request. It reviews the
selected shortlist, not the entire catalogue. Original timing suggestions copy into
day notes when editing/saving; manual edits do not automatically rerun the review.

Tests: `cd backend && .venv/bin/python -m unittest test_itinerary test_saved_itinerary test_gemini_planner -v`.

Implementation follows Google's [Search grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search)
and [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) documentation.

## The assistant

**Ask** is Gemini with tools, not a chatbot bolted on. It has five, and they run
server-side as the caller — the model asks, it never says who it is:

| tool | does |
| --- | --- |
| `search_places` | catalogue search by text, category, price |
| `my_list` | what you've ranked, or what you want to go to |
| `friends_picks` | what the people you follow rated 8+, and who |
| `save_place` | adds to your want-to-go list |
| `create_trip` | builds and saves an itinerary through the same planner the Trips tab uses |

The loop runs at most six model turns, tool results are trimmed to what the model
needs, and it can only mention places that came back from a tool. Writes happen
only when you asked for them in the conversation, and the reply says what changed.
`POST /api/agent/chat` is stateless: the app sends the transcript each time.

Set `GEMINI_API_KEY` in `backend/.env.local` (gitignored) and `GEMINI_MODEL` in
`backend/.env`. On the free tier expect 429s — the client retries a few times and
then says so plainly rather than failing silently.

## Reactions, comments and saves

A "post" is a person's ranking of an item, addressed by `(sub, item_id)` — there
is no separate post document to keep in sync. Reactions are one emoji per person
per post from a fixed palette; comments are a flat thread, and you can only
delete your own. Both are optimistic in the UI. "Want to go" saves an item to
your list, which is what the Lists tab's second section shows. Want-to-go and ranked
are mutually exclusive: ranking something retires its save, and the API refuses to save
a place you've already ranked.

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
comments — and cleans up after itself. 39 checks; it prints what failed.

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

Three cities — San Francisco, New York and Pittsburgh — with a hand-written core
and the rest imported.

* `backend/seed_data.json` — cities and ~16 curated items, each with a real
  description, a tip and a best time. Regenerate the app's offline copy with
  `npm run gen:seed`.
* `python fetch_places.py --per-city 100 [--city sf,nyc]` — imports well-known places from
  Wikipedia: geosearch around each city, filtered to things you'd actually go do
  (not events, not stations, not offices) and ranked by how many language
  editions carry the article. Neighborhoods come from coordinates, photos from
  the article's lead image, and article payloads are cached in
  `.wiki_cache.json` so re-running with different filters costs nothing.
* `python prune_places.py` — re-judges the imported catalogue against today's
  filters and trims each city to its depth, keeping the best-known. Runs of the
  importer only ever add, so this is how a rule change takes effect. Anything
  somebody has ranked or saved is never removed.
* `python backfill_coords.py` — geocodes anything without coordinates, so every
  place can be routed to. Every place in the catalogue has them.
* `python fetch_photos.py` — fills in photos for anything still missing one,
  from [Openverse](https://openverse.org) (openly licensed, no API key). Credit
  and license travel with the URL and are shown on the detail screen.
* Anything missing, you add in the app: **＋ → Add a new place** writes to the
  catalogue for everyone. It asks for a neighborhood from a list and an address,
  which it finds by type-ahead search over OpenStreetMap and shows on a real
  Leaflet map you can drag the pin on. A place that can't be put on a map is
  refused rather than saved as something no trip can route to.
  Search comes from [Photon](https://photon.komoot.io), which is built for
  type-ahead; Nominatim does the one-shot lookups and backfills, since its usage
  policy forbids autocomplete. Neither needs a key and resolves a photo on the way in — or you pick your
  own from the camera roll, which is also how you replace a bad photo on any
  existing place (**a place → Use your own photo instead**).

Uploaded photos are re-encoded server-side — EXIF rotation honoured, long edge
capped at 1600px, JPEG at quality 82 — and stored in GridFS, so the whole stack
still needs only a MongoDB connection string. A place with no photo shows a
monogram on the hatched placeholder rather than an empty box.

**Ids are stable and partitioned**: 1-99 is the hand-written seed, 100-999,999 is
whatever people add in the app, and 1,000,000+ is `1,000,000 + Wikipedia page id`.
That last part matters — re-importing must never hand an id that someone has already
ranked to a different place.

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
