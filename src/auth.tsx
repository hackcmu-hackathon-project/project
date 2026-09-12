import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  /** `signup` opens Auth0's Universal Login on the sign-up tab. */
  signIn: (mode?: 'login' | 'signup') => void;
  signInAsGuest: () => void;
  signOut: () => void;
  configured: boolean;
};

const C = createContext<Ctx>(null as any);
export const useAuth = () => useContext(C);

const DEMO_USER: User = { sub: 'demo|maya', name: 'Maya Okafor', demo: true };

function decodeJwt(jwt: string): any {
  try {
    const body = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = (globalThis as any).atob(body);
    return JSON.parse(decodeURIComponent(escape(json)));
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
  const [pending, setPending] = useState<'login' | 'signup' | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const expiresAt = useRef(0);
  const refreshToken = useRef<string | null>(null);

  const discovery = AuthSession.useAutoDiscovery(`https://${AUTH0_DOMAIN}`);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'rove' });

  const [request, result, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: AUTH0_CLIENT_ID,
      redirectUri,
      responseType: 'code',
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      usePKCE: true,
      extraParams: {
        ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
        ...(pending === 'signup' ? { screen_hint: 'signup' } : {}),
      },
    },
    discovery
  );

  /** Take a token response: remember the user, the access token and its expiry. */
  const adopt = (res: AuthSession.TokenResponse) => {
    const claims = decodeJwt(res.idToken ?? '');
    expiresAt.current = Date.now() + (res.expiresIn ?? 3600) * 1000;
    if (res.refreshToken) {
      refreshToken.current = res.refreshToken;
      session.set(res.refreshToken);
    }
    setToken(res.accessToken ?? res.idToken ?? null);
    setUser({
      sub: claims.sub ?? 'unknown',
      name: claims.name ?? claims.nickname ?? claims.email ?? 'Traveler',
      email: claims.email,
      picture: claims.picture,
    });
  };

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
          { clientId: AUTH0_CLIENT_ID, refreshToken: stored },
          discovery
        );
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
  }, [discovery]);

  // Access tokens are short-lived; renew a minute before they lapse.
  useEffect(() => {
    if (!token || !discovery || !refreshToken.current) return;
    const due = Math.max(30_000, expiresAt.current - Date.now() - 60_000);
    const timer = setTimeout(async () => {
      try {
        const res = await AuthSession.refreshAsync(
          { clientId: AUTH0_CLIENT_ID, refreshToken: refreshToken.current! },
          discovery
        );
        adopt(res);
      } catch {
        // Refresh failed for good: make them sign in again rather than 401 in a loop.
        await session.set(null);
        setToken(null);
        setUser(null);
      }
    }, due);
    return () => clearTimeout(timer);
  }, [token, discovery]);

  useEffect(() => {
    if (!pending || !request) return;
    setPending(null);
    promptAsync();
  }, [pending, request, promptAsync]);

  useEffect(() => {
    if (result?.type !== 'success' || !discovery || !request?.codeVerifier) return;
    setLoading(true);
    AuthSession.exchangeCodeAsync(
      {
        clientId: AUTH0_CLIENT_ID,
        code: result.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      },
      discovery
    )
      .then((res) => adopt(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [result, discovery, request?.codeVerifier, redirectUri]);

  const value = useMemo<Ctx>(
    () => ({
      user,
      token,
      loading: loading || restoring,
      ready: Boolean(discovery) && !restoring,
      configured: true,
      signIn: (mode: 'login' | 'signup' = 'login') => setPending(mode),
      signInAsGuest: () => setUser(DEMO_USER),
      signOut: () => {
        setUser(null);
        setToken(null);
        refreshToken.current = null;
        session.set(null);
        {
          WebBrowser.openAuthSessionAsync(
            `https://${AUTH0_DOMAIN}/v2/logout?client_id=${AUTH0_CLIENT_ID}&returnTo=${encodeURIComponent(redirectUri)}`,
            redirectUri
          ).catch(() => {});
        }
      },
    }),
    [user, token, loading, restoring, discovery, redirectUri]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}
