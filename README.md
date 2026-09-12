# Rove

Rank the days you actually had. Rove is a Beli-style ranking app for *experiences and
itineraries* in a city — you log something you did, say roughly how it went, and then
answer a few head-to-head comparisons. Your scores are relative, so a 9.4 means
something: you put it above everything else.

Starts with **San Francisco** and **New York**.

Built with Expo (iOS, Android, and web), Auth0 for sign-in, MongoDB for storage.
The visual design comes from the Claude Design canvas (`Rove.dc.html`) — Instrument
Serif display type on a warm paper ground, plum/gold score chips, floating tab bar.

## Run it

```bash
npm install
npm run web        # simulate in the browser (a phone frame appears on wide screens)
npm start          # or: press i / a for a real simulator
```

With no `.env`, the app runs in **demo mode**: everything works, nothing persists.

## Real auth + storage

```bash
cp .env.example .env                 # Auth0 native app + API URL
cp server/.env.example server/.env   # MongoDB URI + Auth0 API audience
npm --prefix server install
npm run server                       # http://localhost:4000
```

**Auth0 setup**
1. Applications → Create → *Native*. Copy the domain + client ID into `.env`.
2. Add `rove://*` and `http://localhost:8081` to Allowed Callback and Logout URLs.
3. APIs → Create an API with identifier `https://rove.api` (RS256). Use that same
   value for `EXPO_PUBLIC_AUTH0_AUDIENCE` and `AUTH0_AUDIENCE`.

**MongoDB** — any Atlas cluster or local `mongod`. The server creates two collections:

| collection | shape |
| --- | --- |
| `users` | `{ _id: auth0 sub, name, email, picture, createdAt, lastSeenAt }` |
| `rankings` | `{ _id: "sub:itemId", sub, itemId, tier, score, note, updatedAt }` |

## How the ranking works

Three tiers map to score bands — loved `8–10`, liked `5–7.9`, fine `2–4.9`. A new
entry is placed inside its tier by binary-search comparisons (about `log₂ n` of them),
then every score in that tier is redistributed evenly across the band. That means one
new ranking rewrites its whole tier, so the client sends the recomputed tier to
`PUT /api/rankings` in a single batch.

## Layout

```
App.tsx              shell, tab/stack routing, web phone frame
src/theme.ts         palette, type, tier bands, score colors
src/data.ts          seed experiences + feed (generated from Rove.dc.html)
src/auth.tsx         Auth0 via expo-auth-session, with a demo fallback
src/api.ts           typed fetch wrapper for the Rove API
src/store.tsx        ranking state + score recomputation + sync
src/screens/         Feed, Lists, Explore, Profile, Detail, Rank, SignIn
server/index.js      Express + MongoDB, Auth0 JWT-protected
```
