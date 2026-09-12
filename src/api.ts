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
  photo_url: string | null;
  photo_thumb: string | null;
  photo_credit: string | null;
  photo_license: string | null;
  photo_source_url: string | null;
  photo_provider?: string | null;
  wikipedia_url?: string | null;
};

export type ApiRanking = { item_id: number; tier: Tier; score: number; note: string | null; item: ApiItem };

export type ApiFeedEntry = {
  id: string;
  user_sub: string | null;
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
  reactions: Record<string, number>;
  my_reaction: string | null;
  saved: boolean;
};

export type Comment = {
  id: string;
  author_sub: string;
  author_name: string;
  author_color: string;
  text: string;
  created_at: string;
  mine: boolean;
};

export type Activity = {
  photo_urls?: string[];
  owner_sub: string;
  owner_name: string;
  owner_handle: string;
  owner_color: string;
  item: ApiItem;
  tier: string;
  score: number;
  note: string;
  when: string;
  rank: number | null;
  total: number | null;
  reactions: Record<string, number>;
  my_reaction: string | null;
  comments: Comment[];
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

/** Uploaded photos are served by the API itself, so relative URLs need the host. */
export const absolute = (url: string | null | undefined): string | null =>
  !url ? null : url.startsWith('/') ? `${API_URL}${url}` : url;

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
  photo: absolute(a.photo_url),
  photoThumb: absolute(a.photo_thumb ?? a.photo_url),
  photoCredit: a.photo_credit ?? null,
  photoLicense: a.photo_license ?? null,
  photoSource: a.photo_source_url ?? null,
  photoProvider: a.photo_provider ?? null,
  wikipedia: a.wikipedia_url ?? null,
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

export type PlacePhoto = { url: string; credit: string; source: string; by: string | null };

export type ItemRanking = {
  sub: string;
  name: string;
  color: string;
  score: number;
  tier: string;
  note: string | null;
};

export type MyActivity = {
  kind: 'reaction' | 'comment';
  who: string;
  who_sub: string;
  color: string;
  emoji: string;
  text: string;
  item_id: number;
  item_title: string;
  when: string;
};

export type AgentTurn = { role: 'user' | 'model'; text: string };

export type AgentReply = {
  reply: string;
  places: ApiItem[];
  trip: SavedTrip | null;
  used: string[];
  saved_ids?: number[];
};

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

export type ItineraryRequest = {
  city: CityKey; start_date: string; end_date: string; must_try_ids: number[];
  use_gemini?: boolean; preferences?: string;
  stops_per_day: number; travel_mode: 'walking' | 'driving' | 'bicycling';
};
export type GeminiReview = {
  status: 'gemini' | 'fallback'; message: string; checked_at?: string;
  sources?: { title: string; url: string }[]; search_html?: string;
  omitted?: { item_id: number; title: string; reason: string }[];
};
export type VisitSchedule = { arrival: string; departure: string; travel_minutes: number; hours: string; caution: string };
export type ItineraryResult = {
  review?: GeminiReview;
  days: { date: string; stops: { item: ApiItem; reasons: string[]; schedule?: VisitSchedule }[]; activity_minutes: number; maps_url: string | null }[];
  unscheduled_count: number; unscheduled_must_try_ids: number[];
};

export type SavedTrip = {
  id: string; title: string; city: CityKey; travel_mode: ItineraryRequest['travel_mode'];
  revision: number; updated_at: string;
  days: (ItineraryResult['days'][number] & { notes?: string })[];
};
export type SaveTrip = {
  title: string; city: CityKey; travel_mode: ItineraryRequest['travel_mode']; revision: number;
  days: { date: string; item_ids: number[]; notes: string }[];
};

export const api = {
  uploadRankingPhotos: async (token: string | null, itemId: number, files: { uri: string; name: string; type: string }[]): Promise<{ photo_urls: string[] }> => {
    const body = new FormData();
    for (const file of files) {
      if (file.uri.startsWith('data:') || file.uri.startsWith('blob:')) {
        const blob = await (await fetch(file.uri)).blob();
        body.append('files', new File([blob], file.name, { type: file.type }));
      } else body.append('files', file as any);
    }
    const res = await fetch(`${API_URL}/api/rankings/${itemId}/photos`, {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  },
  agent: (token: string | null, messages: AgentTurn[], city: string): Promise<AgentReply> =>
    call('/api/agent/chat', token, { method: 'POST', body: JSON.stringify({ messages, city }) }),
  trips: (token: string | null): Promise<SavedTrip[]> => call('/api/itineraries', token),
  deleteTrip: (token: string | null, id: string) =>
    call(`/api/itineraries/${encodeURIComponent(id)}`, token, { method: 'DELETE' }),
  saveTrip: (token: string | null, id: string, body: SaveTrip): Promise<SavedTrip> =>
    call(`/api/itineraries/${encodeURIComponent(id)}`, token, { method: 'PUT', body: JSON.stringify(body) }),
  itinerary: (token: string | null, body: ItineraryRequest): Promise<ItineraryResult> =>
    call('/api/itineraries/generate', token, { method: 'POST', body: JSON.stringify(body) }),
  health: () => call('/health', null),
  me: (token: string | null): Promise<Me> => call('/api/me', token),
  updateMe: (token: string | null, patch: { name?: string; handle?: string; bio?: string }) =>
    call('/api/me', token, { method: 'PATCH', body: JSON.stringify(patch) }),
  people: (token: string | null, q = ''): Promise<Person[]> =>
    call(`/api/people${q ? `?q=${encodeURIComponent(q)}` : ''}`, token),
  following: (token: string | null): Promise<Person[]> => call('/api/people/following', token),
  person: (token: string | null, sub: string): Promise<Person> =>
    call(`/api/people/${encodeURIComponent(sub)}`, token),
  personRankings: (token: string | null, sub: string): Promise<ApiRanking[]> =>
    call(`/api/people/${encodeURIComponent(sub)}/rankings`, token),
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
  /** Upload a photo for a place. `file` is what the picker handed us. */
  uploadPhoto: async (
    token: string | null,
    itemId: number,
    file: { uri: string; name: string; type: string }
  ): Promise<Item> => {
    const body = new FormData();
    if (file.uri.startsWith('data:') || file.uri.startsWith('blob:')) {
      // Web: the picker gives a blob/data URI, which fetch can turn into a File.
      const blob = await (await fetch(file.uri)).blob();
      body.append('file', new File([blob], file.name, { type: file.type }));
    } else {
      body.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    }
    const res = await fetch(`${API_URL}/api/items/${itemId}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return toItem(await res.json());
  },
  createItem: async (
    token: string | null,
    body: { city: string; title: string; hood: string; category: string; duration_min?: number; price?: number; note?: string; tip?: string; best_time?: string }
  ): Promise<Item> => toItem(await call('/api/items', token, { method: 'POST', body: JSON.stringify(body) })),
  myActivity: (token: string | null): Promise<MyActivity[]> => call('/api/activity/mine', token),
  itemPhotos: (token: string | null, itemId: number): Promise<PlacePhoto[]> =>
    call(`/api/items/${itemId}/photos`, token).then((rows: PlacePhoto[]) =>
      rows.map((p) => ({ ...p, url: absolute(p.url)! }))
    ),
  itemRankings: (token: string | null, itemId: number): Promise<ItemRanking[]> =>
    call(`/api/items/${itemId}/rankings`, token),
  saves: (token: string | null): Promise<ApiItem[]> => call('/api/saves', token),
  save: (token: string | null, itemId: number) => call(`/api/saves/${itemId}`, token, { method: 'PUT' }),
  unsave: (token: string | null, itemId: number) => call(`/api/saves/${itemId}`, token, { method: 'DELETE' }),
  activity: (token: string | null, owner: string, itemId: number): Promise<Activity> =>
    call(`/api/activity/${encodeURIComponent(owner)}/${itemId}`, token),
  react: (token: string | null, owner: string, itemId: number, emoji: string) =>
    call(`/api/activity/${encodeURIComponent(owner)}/${itemId}/reaction`, token, {
      method: 'PUT',
      body: JSON.stringify({ emoji }),
    }),
  unreact: (token: string | null, owner: string, itemId: number) =>
    call(`/api/activity/${encodeURIComponent(owner)}/${itemId}/reaction`, token, { method: 'DELETE' }),
  comment: (token: string | null, owner: string, itemId: number, text: string): Promise<Comment> =>
    call(`/api/activity/${encodeURIComponent(owner)}/${itemId}/comments`, token, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  deleteComment: (token: string | null, id: string) => call(`/api/comments/${id}`, token, { method: 'DELETE' }),
  setNote: (token: string | null, itemId: number, note: string) =>
    call(`/api/rankings/${itemId}`, token, { method: 'PATCH', body: JSON.stringify({ note }) }),
  unrank: (token: string | null, itemId: number) =>
    call(`/api/rankings/${itemId}`, token, { method: 'DELETE' }),
};
