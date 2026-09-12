#!/bin/sh
# Seed an empty database so a fresh deploy has something to look at, then serve.
set -e

# Railway (and most hosts) supply the connection string under their own name.
if [ -z "$MONGODB_URI" ] && [ -n "$MONGO_URL" ]; then
  export MONGODB_URI="$MONGO_URL"
fi

if [ "$(python -c "
import asyncio
from app.db import get_db, close_client
async def main():
    n = await get_db().items.count_documents({})
    await close_client()
    print(n)
asyncio.run(main())
")" = "0" ]; then
  echo "Empty database — seeding cities, catalogue and demo accounts."
  python seed.py --demo-people --dev-user
  echo "For the full catalogue: docker compose run --rm api python fetch_places.py --per-city 100"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8010}"
