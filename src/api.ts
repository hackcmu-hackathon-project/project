import { API_URL } from './config';
import { Category, CityKey, Item } from './data';
import { Tier } from './theme';

export type ApiItem = {
  id: number;
  city: CityKey;
  title: string;
  hood: string;
  category: Category;
  duration_min: number;
  price: number;
  best_time: string;
  note: string;
  tip: string;
  tags: string[];
  img: string;
};

export type ApiRanking = { item_id: number; tier: Tier; score: number; note: string | null; item: ApiItem };

export type ApiFeedEntry = {
  id: string;
  user_name: string;
  user_color: string;
  item: ApiItem;
  score: number;
  tier: Tier;
  action: string;
  time: string;
  likes: number;
  comments: number;
  note: string;
  img: string;
};

/** Server ranking-session state: either the next duel or the final placement. */
export type RankState = {
  sessionId: string;
  done: boolean;
  comparison: number;
  opponent: Item | null;
  opponentRank: number | null;
  opponentScore: number | null;
  item: Item | null;
  score: number | null;
  rank: number | null;
  total: number | null;
};

export const toItem = (a: ApiItem): Item => ({
  id: a.id,
  city: a.city,
  title: a.title,
  hood: a.hood,
  category: a.category ?? 'Culture',
  durationMin: a.duration_min ?? 60,
  price: a.price ?? 0,
  bestTime: a.best_time ?? '',
  note: a.note ?? '',
  tip: a.tip ?? '',
  tags: a.tags ?? [],
  img: a.img ?? 'photo',
  tier: null,
  score: null,
});

const toRankState = (r: any): RankState => ({
  sessionId: r.session_id ?? '',
  done: Boolean(r.done),
  comparison: r.comparison ?? 0,
  opponent: r.opponent ? toItem(r.opponent) : null,
  opponentRank: r.opponent_rank ?? null,
  opponentScore: r.opponent_score ?? null,
  item: r.item ? toItem(r.item) : null,
  score: r.score ?? null,
  rank: r.rank ?? null,
  total: r.total ?? null,
});

async function call(path: string, token: string | null, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export type Person = {
  sub: string;
  name: string;
  handle: string;
  picture: string | null;
  color: string;
  bio: string;
  ranked: number;
  followers: number;
  following: boolean;
  top_pick: string | null;
};

export type Me = {
  sub: string;
  name: string;
  handle: string;
  email: string | null;
  picture: string | null;
  bio: string;
  ranked: Record<string, number>;
  following: number;
  followers: number;
  new_user: boolean;
};

export const api = {
  health: () => call('/health', null),
  me: (token: string | null): Promise<Me> => call('/api/me', token),
  updateMe: (token: string | null, patch: { name?: string; handle?: string; bio?: string }) =>
    call('/api/me', token, { method: 'PATCH', body: JSON.stringify(patch) }),
  people: (token: string | null, q = ''): Promise<Person[]> =>
    call(`/api/people${q ? `?q=${encodeURIComponent(q)}` : ''}`, token),
  following: (token: string | null): Promise<Person[]> => call('/api/people/following', token),
  follow: (token: string | null, sub: string) =>
    call(`/api/people/${encodeURIComponent(sub)}/follow`, token, { method: 'PUT' }),
  unfollow: (token: string | null, sub: string) =>
    call(`/api/people/${encodeURIComponent(sub)}/follow`, token, { method: 'DELETE' }),
  items: async (token: string | null): Promise<Item[]> =>
    (await call('/api/items', token)).map(toItem),
  rankings: (token: string | null): Promise<ApiRanking[]> => call('/api/rankings', token),
  feed: (token: string | null, scope: 'following' | 'everyone' = 'following'): Promise<ApiFeedEntry[]> =>
    call(`/api/feed?scope=${scope}`, token),
  rankStart: async (token: string | null, itemId: number, tier: Tier): Promise<RankState> =>
    toRankState(await call('/api/rank/start', token, { method: 'POST', body: JSON.stringify({ item_id: itemId, tier }) })),
  rankCompare: async (token: string | null, sessionId: string, winner: 'new' | 'opponent'): Promise<RankState> =>
    toRankState(
      await call('/api/rank/compare', token, { method: 'POST', body: JSON.stringify({ session_id: sessionId, winner }) })
    ),
  setNote: (token: string | null, itemId: number, note: string) =>
    call(`/api/rankings/${itemId}`, token, { method: 'PATCH', body: JSON.stringify({ note }) }),
  unrank: (token: string | null, itemId: number) =>
    call(`/api/rankings/${itemId}`, token, { method: 'DELETE' }),
};
