/**
 * Runtime config from EXPO_PUBLIC_* env vars (see .env.example).
 *
 * The API is the FastAPI service in ./backend. With it running, the app reads
 * and writes real data; if it is unreachable the app falls back to the bundled
 * seed so the UI is still explorable. Auth0 is optional too — the backend runs
 * open in local dev, so a token is sent only when one exists.
 */
export const AUTH0_DOMAIN = (process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
export const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? '';
/**
 * The API identifier registered in Auth0, if there is one.
 *
 * Set it and Auth0 issues a JWT access token scoped to that API — the right
 * thing for a real deployment. Leave it blank and we send the ID token as the
 * bearer instead, which the backend also accepts (it verifies `aud` against the
 * client ID). That fallback exists because an audience requires the app to be
 * granted the resource server in the Auth0 dashboard, and a demo tenant often
 * isn't. See docs/auth0.md.
 */
export const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? '';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8010';

export const authConfigured = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);
