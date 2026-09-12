/**
 * All runtime config comes from EXPO_PUBLIC_* env vars (see .env.example).
 * When Auth0 or the API are unset the app runs in local demo mode: everything
 * works, nothing persists past a reload.
 */
export const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '';
export const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? '';
export const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? '';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const authConfigured = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);
export const apiConfigured = Boolean(API_URL);
