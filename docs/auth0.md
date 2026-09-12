# Auth0 setup

Tenant: `dev-5kw4mmxo44z4bhii.us.auth0.com` (region US).

Everything below is done once in the Auth0 dashboard. Skip it and the app still
runs — it falls back to a single local dev account — but nobody can sign in.

## 1. Create the API (do this first)

**Applications → APIs → Create API**

| Field | Value |
| --- | --- |
| Name | `Rove API` |
| Identifier | `https://rove.api` |
| Signing algorithm | `RS256` |

Then open the API → **Settings** → turn on **Allow Offline Access**. Without it
Auth0 refuses `offline_access`, no refresh token comes back, and the app asks
people to sign in again every hour.

The identifier is the `audience`. It is what makes Auth0 issue a *JWT* access
token instead of an opaque one; the backend can only verify a JWT.

## 2. Create the application

**Applications → Applications → Create Application**

- Name: `Rove`
- Type: **Native** (not SPA — Expo uses the native PKCE flow, and Native apps
  get refresh tokens without rotation gymnastics)

In its **Settings** tab, fill in these lists (comma-separated):

- **Allowed Callback URLs** — the redirect URI differs per platform, so include
  every one you'll actually run:
  - `rove://callback` — a dev build or the standalone app (scheme from
    `app.json`; Auth0 rejects a bare `rove://`, so the native redirect adds a
    host — see the `native` option in `src/auth.tsx`)
  - `http://localhost:8081` — `npm run web`
  - `exp://127.0.0.1:8081`, `exp://localhost:8081` — Expo Go on this machine
  - `exp://<your-LAN-IP>:8081` — Expo Go on a phone
- **Allowed Logout URLs** — the same list
- **Allowed Web Origins** — `http://localhost:8081`

The app logs the exact string it will send on startup in dev:
`[auth0] redirect URI → …`. If a sign-in fails with *Callback URL mismatch*,
copy that line into Allowed Callback URLs verbatim.

Under **Advanced Settings → Grant Types**, confirm `Authorization Code` and
`Refresh Token` are checked (Native apps get both by default).

## 3. Connections

**Authentication → Database** gives you email/password out of the box. For
Google, enable **Authentication → Social → google-oauth2** and make sure it is
toggled on for the `Rove` application. Dev keys work for testing; a production
build needs your own Google client.

## 4. Fill in the env files

`.env` in the repo root (copy from `.env.example`):

```
EXPO_PUBLIC_API_URL=http://localhost:8010
EXPO_PUBLIC_AUTH0_DOMAIN=dev-5kw4mmxo44z4bhii.us.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=<Client ID from the application's Settings tab>
EXPO_PUBLIC_AUTH0_AUDIENCE=https://rove.api
```

`backend/.env`:

```
AUTH0_DOMAIN=dev-5kw4mmxo44z4bhii.us.auth0.com
AUTH0_AUDIENCE=https://rove.api
```

Restart both — Expo reads `EXPO_PUBLIC_*` at bundle time (`npm start -c`), and
the API caches settings at import.

## 5. Check it

```
curl localhost:8010/health          # "auth": "auth0"
curl localhost:8010/me              # 401 Missing bearer token
```

Then sign in from the app. The access token is a JWT with `aud:
https://rove.api`; paste one into jwt.io if you need to see what the API sees.

## How it works here

- `src/auth.tsx` runs the PKCE authorization-code flow via `expo-auth-session`,
  keeps the access token in memory and the refresh token in the Keychain
  (`src/session.ts`), and renews a minute before expiry.
- `backend/app/auth.py` verifies RS256 against the tenant's JWKS. Access tokens
  carry no profile, so the first request per subject fetches `/userinfo` once
  and caches it for an hour — that's where display names and avatars come from.
- With `AUTH0_DOMAIN` unset the backend attributes every request to
  `dev|local`. `ENV=production` refuses to start in that state.
