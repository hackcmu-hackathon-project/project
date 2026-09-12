# Working on rankings

## Personal notes and photo albums

The ranking screen accepts up to 10 selected photos and a memory note, for both
existing and newly created places. After the score is saved, use **Save note &
photos** to attach these extras. **Done without extras** leaves the already-saved
ranking visible without uploading the draft. This is not a private-post setting.

`POST /api/rankings/{item_id}/photos` accepts multipart `files` (up to 10 photos
total per ranking, 8 MB per file). It requires ownership of an existing ranking,
validates the batch before writing, and deduplicates normalized images on retry.
Images live in the `ranking_photos` GridFS bucket, separate from place covers.
The activity response includes `photo_urls`; the activity screen displays the album.
Photo URLs are viewable by anyone with the URL while the ranking exists, consistent
with the app's shared activity model. No private photo albums are implemented.

Tests use a MongoDB test double and a simulated GridFS bucket; device photo picking
and real GridFS storage still need a manual integration check.

The frontend already calls these FastAPI routes in `app/routes.py`:

1. `POST /api/rank/start` with `{"item_id": 1, "tier": "loved"}`.
2. If `done` is false, show `opponent` and send `POST /api/rank/compare`
   with `{"session_id": "...", "winner": "new"}` or `"opponent"`.
3. Repeat until `done` is true, then reload `GET /api/rankings`.
4. `PATCH /api/rankings/1` with `{"note": "Great afternoon"}` saves a note.
5. `DELETE /api/rankings/1` removes the ranking and recalculates its tier.

All routes obtain the user ID from `current_user().sub`. Coordinate that interface
with the auth owner; clients never supply the owner of a ranking. Tests override
the auth dependency and do not require Auth0 credentials.

## Engine behavior

`app/ranking.py` compares within one user's city and tier. Empty tiers finish
immediately with the midpoint score. Other entries use binary search, followed by
evenly spaced scores across the tier's band. Moving tiers recalculates both the
source and destination, preserving notes. Stored `position` breaks rounded-score
ties in API results; existing rows acquire positions when their tier is rescored.

Starting again for the same item replaces its previous session. A committed change
or deletion invalidates that user's outstanding sessions; restart ranking on a
404 or 409 response. Sessions expire after one hour even before Mongo's TTL cleanup.

The current storage design does not make multi-document rescoring transactional.
Concurrent ranking writes from separate devices/workers still need per-user
serialization or transactions before supporting that usage reliably.

## Tests

From `project/backend`:

```sh
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover -s tests -v
```

These exercise the engine and HTTP routes using an in-memory MongoDB test double.
They do not test real MongoDB persistence or Auth0 verification. For a manual
check, start MongoDB and the API using the root README, then use
`http://localhost:8010/docs` to rank two seeded items, change a tier, remove one,
and fetch the rankings again.
