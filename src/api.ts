import { API_URL, apiConfigured } from './config';

async function call(path: string, token: string, init: RequestInit = {}) {
  if (!apiConfigured) return null;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export type RankingRow = { itemId: number; tier: string; score: number };

export const api = {
  me: (token: string) => call('/api/me', token),
  getRankings: (token: string): Promise<RankingRow[] | null> => call('/api/rankings', token),
  putRankings: (token: string, rows: RankingRow[]) =>
    call('/api/rankings', token, { method: 'PUT', body: JSON.stringify({ rankings: rows }) }),
  deleteRanking: (token: string, itemId: number) =>
    call(`/api/rankings/${itemId}`, token, { method: 'DELETE' }),
  feed: (token: string) => call('/api/feed', token),
};
