import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CityKey, FEED, ITEMS, Item } from './data';
import { TIERS, Tier } from './theme';
import { api } from './api';
import { useAuth } from './auth';

type RankState = { tier: Tier; score: number };

type Ctx = {
  city: CityKey;
  setCity: (c: CityKey) => void;
  items: Item[];
  ranked: (city: CityKey) => Item[];
  wants: (city: CityKey) => Item[];
  rankingsOf: (id: number) => RankState | null;
  /** Recompute every score in a tier after inserting `newId` at `pos`. */
  applyRanking: (newId: number, tier: Tier, pos: number) => number;
  unrank: (id: number) => void;
  syncing: boolean;
};

const C = createContext<Ctx>(null as any);
export const useStore = () => useContext(C);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [city, setCity] = useState<CityKey>('sf');
  const [items, setItems] = useState<Item[]>(() => ITEMS.map((i) => ({ ...i })));
  const [syncing, setSyncing] = useState(false);

  // Pull the signed-in user's rankings from MongoDB, overlaying the seed content.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setSyncing(true);
    api
      .getRankings(token)
      .then((rows) => {
        if (!alive || !rows) return;
        setItems((prev) =>
          prev.map((i) => {
            const r = rows.find((x: any) => x.itemId === i.id);
            return r ? { ...i, tier: r.tier as Tier, score: r.score } : { ...i, tier: null, score: null };
          })
        );
      })
      .catch(() => {})
      .finally(() => alive && setSyncing(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const ranked = useCallback(
    (c: CityKey) => items.filter((i) => i.city === c && i.score != null).sort((a, b) => b.score! - a.score!),
    [items]
  );
  const wants = useCallback((c: CityKey) => items.filter((i) => i.city === c && i.score == null), [items]);

  const applyRanking = useCallback(
    (newId: number, tier: Tier, pos: number) => {
      const target = items.find((i) => i.id === newId)!;
      const pool = items
        .filter((i) => i.city === target.city && i.tier === tier && i.score != null && i.id !== newId)
        .sort((a, b) => b.score! - a.score!)
        .map((i) => i.id);
      pool.splice(pos, 0, newId);

      const [min, max] = TIERS[tier].range;
      const step = pool.length > 1 ? (max - min) / (pool.length - 1) : 0;
      const scores: Record<number, number> = {};
      pool.forEach((id, idx) => {
        scores[id] = pool.length > 1 ? +(max - step * idx).toFixed(1) : +((min + max) / 2).toFixed(1);
      });

      setItems((prev) => prev.map((i) => (scores[i.id] != null ? { ...i, tier, score: scores[i.id] } : i)));

      if (token) {
        api
          .putRankings(
            token,
            Object.entries(scores).map(([id, score]) => ({ itemId: Number(id), tier, score }))
          )
          .catch(() => {});
      }
      return scores[newId];
    },
    [items, token]
  );

  const unrank = useCallback(
    (id: number) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, tier: null, score: null } : i)));
      if (token) api.deleteRanking(token, id).catch(() => {});
    },
    [token]
  );

  const value = useMemo<Ctx>(
    () => ({
      city,
      setCity,
      items,
      ranked,
      wants,
      rankingsOf: (id) => {
        const i = items.find((x) => x.id === id);
        return i && i.score != null ? { tier: i.tier!, score: i.score } : null;
      },
      applyRanking,
      unrank,
      syncing,
    }),
    [city, items, ranked, wants, applyRanking, unrank, syncing]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export { FEED };
