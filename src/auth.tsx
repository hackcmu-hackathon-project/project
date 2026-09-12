import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { session } from './session';
import { AUTH0_AUDIENCE, AUTH0_CLIENT_ID, AUTH0_DOMAIN, authConfigured } from './config';

WebBrowser.maybeCompleteAuthSession();

export type User = { sub: string; name: string; email?: string; picture?: string; demo?: boolean };

type Ctx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  ready: boolean;
  /** Last thing that went wrong in the browser hand-off, for the sign-in screen. */
  error: string | null;
  /** `signup` opens Auth0's Universal Login on the sign-up tab. */
  signIn: (mode?: 'login' | 'signup') => void;
  signInAsGuest: () => void;
  signOut: () => void;
  configured: boolean;
};

const C = createContext<Ctx>(null as any);
export const useAuth = () => useContext(C);

const DEMO_USER: User = { sub: 'demo|maya', name: 'Maya Okafor', demo: true };

function b64urlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const bin = (globalThis as any).atob(b64) as string;
  // atob yields one char per byte; re-read those bytes as UTF-8 so names with
  // accents or non-Latin scripts survive the trip.
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (typeof (globalThis as any).TextDecoder === 'function') {
    return new (globalThis as any).TextDecoder('utf-8').decode(bytes);
  }
  return decodeURIComponent(bin.split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
}

function decodeJwt(jwt: string): any {
  try {
    return JSON.parse(b64urlDecode(jwt.split('.')[1]));
  } catch {
    return {};
  }
}

/** Wraps the tree. Auth0 hooks only mount when Auth0 is actually configured. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return authConfigured ? <Auth0Provider>{children}</Auth0Provider> : <DemoProvider>{children}</DemoProvider>;
}

function DemoProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const value = useMemo<Ctx>(
    () => ({
      user,
      token: null,
      loading: false,
      ready: true,
      error: null,
      configured: false,
      signIn: () => setUser(DEMO_USER),
      signInAsGuest: () => setUser(DEMO_USER),
      signOut: () => setUser(null),
    }),
    [user]
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

function Auth0Provider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  // Auth0 chooses the login vs sign-up tab from `screen_hint`, which is baked
  // into the request, so switching modes means rebuilding the request first.
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [promptNonce, setPromptNonce] = useState(0);
  const wantsPrompt = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expiresAt = useRef(0);
  const refreshToken = useRef<string | null>(null);
  // Auth codes are single-use: React can run the exchange effect twice for the
  // same result, and the second attempt would fail with invalid_grant.
  const exchanged = useRef<string | null>(null);

  const discovery = AuthSession.useAutoDiscovery(`https://${AUTH0_DOMAIN}`);
  // `native` applies only to standalone/dev builds — Expo Go stays on exp:// and
  // web on http://localhost. Auth0 rejects a bare `rove://` as a callback URL,
  // so the standalone redirect carries a host.
  const redirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: 'rove', native: 'rove://callback' }),
    []
  );

  // The exact string Auth0 must have in "Allowed Callback URLs" — it differs
  // between Expo Go (exp://…), a dev build (rove://) and web (http://localhost).
  useEffect(() => {
    if (__DEV__) console.log('[auth0] redirect URI →', redirectUri);
  }, [redirectUri]);

  const [request, result, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: AUTH0_CLIENT_ID,
      redirectUri,
      responseType: 'code',
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      usePKCE: true,
      extraParams: {
        // With an audience Auth0 issues a JWT access token for that API; without
        // one the access token is opaque, so we fall back to the ID token below.
        ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
        ...(mode === 'signup' ? { screen_hint: 'signup' } : {}),
      },
    },
    discovery
  );

  /** Take a token response: remember the user, the access token and its expiry. */
  const adopt = useCallback((res: AuthSession.TokenResponse) => {
    const claims = decodeJwt(res.idToken ?? '');
    expiresAt.current = Date.now() + (res.expiresIn ?? 3600) * 1000;
    if (res.refreshToken) {
      refreshToken.current = res.refreshToken;
      session.set(res.refreshToken);
    }
    // Only an audience-scoped access token is a verifiable JWT; otherwise the
    // ID token is the one the backend can check.
    setToken((AUTH0_AUDIENCE ? res.accessToken : res.idToken) ?? res.idToken ?? null);
    setUser({
      sub: claims.sub ?? 'unknown',
      name: claims.name ?? claims.nickname ?? claims.email ?? 'Traveler',
      email: claims.email,
      picture: claims.picture,
    });
    setError(null);
  }, []);

  const forgetSession = useCallback(async () => {
    refreshToken.current = null;
    expiresAt.current = 0;
    await session.set(null);
    setToken(null);
    setUser(null);
  }, []);

  // Come back signed in: exchange the stored refresh token on launch.
  useEffect(() => {
    if (!discovery) return;
    let alive = true;
    (async () => {
      const stored = await session.get();
      if (!stored) {
        if (alive) setRestoring(false);
        return;
      }
      try {
        const res = await AuthSession.refreshAsync(
          { clientId: AUTH0_CLIENT_ID, refreshToken: stored, extraParams: AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {} },
          discovery
        );
        // Rotation can hand back a new refresh token; if not, keep the old one.
        refreshToken.current = res.refreshToken ?? stored;
        if (alive) adopt(res);
      } catch {
        await session.set(null);
      } finally {
        if (alive) setRestoring(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [discovery, adopt]);

  // Access tokens are short-lived; renew a minute before they lapse.
  useEffect(() => {
    if (!token || !discovery || !refreshToken.current) return;
    const due = Math.max(30_000, expiresAt.current - Date.now() - 60_000);
    const timer = setTimeout(async () => {
      try {
        const res = await AuthSession.refreshAsync(
          {
            clientId: AUTH0_CLIENT_ID,
            refreshToken: refreshToken.current!,
            extraParams: AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {},
          },
          discovery
        );
        adopt(res);
      } catch {
        // Refresh failed for good: make them sign in again rather than 401 in a loop.
        await forgetSession();
      }
    }, due);
    return () => clearTimeout(timer);
  }, [token, discovery, adopt, forgetSession]);

  // Open the browser only once the built request carries the mode we asked for —
  // `useAuthRequest` rebuilds asynchronously, and prompting early would show the
  // login tab to someone who tapped "Create an account".
  useEffect(() => {
    if (!wantsPrompt.current || !request || !discovery) return;
    const hinted = (request.extraParams as Record<string, string> | undefined)?.screen_hint === 'signup';
    if (hinted !== (mode === 'signup')) return;
    wantsPrompt.current = false;
    setLoading(true);
    promptAsync().catch((e: any) => {
      setError(e?.message ?? 'Could not open the sign-in page.');
      setLoading(false);
    });
  }, [request, discovery, mode, promptNonce, promptAsync]);

  useEffect(() => {
    if (!result) return;
    if (result.type === 'error') {
      setLoading(false);
      setError(result.params?.error_description ?? result.error?.message ?? 'Sign-in failed.');
      return;
    }
    if (result.type === 'dismiss' || result.type === 'cancel') {
      setLoading(false);
      return;
    }
    if (result.type !== 'success' || !discovery || !request?.codeVerifier) return;
    const code = result.params.code;
    if (!code || exchanged.current === code) return;
    exchanged.current = code;
    setLoading(true);
    AuthSession.exchangeCodeAsync(
      {
        clientId: AUTH0_CLIENT_ID,
        code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      },
      discovery
    )
      .then(adopt)
      .catch((e: any) => setError(e?.message ?? 'Could not finish signing in.'))
      .finally(() => setLoading(false));
  }, [result, discovery, request, redirectUri, adopt]);

  const value = useMemo<Ctx>(
    () => ({
      user,
      token,
      loading: loading || restoring,
      ready: Boolean(discovery) && !restoring,
      error,
      configured: true,
      signIn: (next: 'login' | 'signup' = 'login') => {
        setError(null);
        wantsPrompt.current = true;
        setMode(next);
        setPromptNonce((n) => n + 1);
      },
      signInAsGuest: () => setUser(DEMO_USER),
      signOut: () => {
        forgetSession();
        // Clear Auth0's own session cookie too, or the next sign-in silently
        // reuses the account they just left.
        WebBrowser.openAuthSessionAsync(
          `https://${AUTH0_DOMAIN}/v2/logout?client_id=${encodeURIComponent(AUTH0_CLIENT_ID)}&returnTo=${encodeURIComponent(redirectUri)}`,
          redirectUri
        ).catch(() => {});
      },
    }),
    [user, token, loading, restoring, discovery, error, redirectUri, forgetSession]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}
