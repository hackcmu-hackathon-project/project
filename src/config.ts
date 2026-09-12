/**
 * Runtime config from EXPO_PUBLIC_* env vars (see .env.example).
 *
 * The API is the FastAPI service in ./backend. With it running, the app reads
 * and writes real data; if it is unreachable the app falls back to the bundled
 * seed so the UI is still explorable. Auth0 is optional too — the backend runs
 * open in local dev, so a token is sent only when one exists.
 */
export const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '';
export const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? '';
export const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? '';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8010';

export const authConfigured = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);
