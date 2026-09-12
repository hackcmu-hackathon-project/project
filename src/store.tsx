import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CityKey, FEED as SEED_FEED, ITEMS, Item, itemById } from './data';
import { TIERS, Tier } from './theme';
import { RankState, api, toItem } from './api';
import { useAuth } from './auth';

export type Connection = 'connecting' | 'online' | 'offline';

export type FeedRow = {
  id: string;
  userName: string;
  userColor: string;
  item: Item;
  score: number;
  action: string;
  time: string;
  likes: number;
  comments: number;
  note: string;
  img: string;
};

type Ctx = {
  city: CityKey;
  setCity: (c: CityKey) => void;
  items: Item[];
  feed: FeedRow[];
  connection: Connection;
  ranked: (city: CityKey) => Item[];
  wants: (city: CityKey) => Item[];
  /** Open a ranking session for an item in a tier. Resolves to the first duel, or straight to a result. */
  rankStart: (itemId: number, tier: Tier) => Promise<RankState>;
  rankCompare: (sessionId: string, winner: 'new' | 'opponent') => Promise<RankState>;
  saveNote: (itemId: number, note: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const C = createContext<Ctx>(null as any);
export const useStore = () => useContext(C);

const localFeed = (items: Item[]): FeedRow[] =>
  SEED_FEED.map((p) => ({
    id: p.id,
    userName: p.friend.name,
    userColor: p.friend.color,
    item: items.find((i) => i.id === p.itemId) ?? itemById(p.itemId),
    score: p.score,
    action: p.action,
    time: p.time,
    likes: p.likes,
    comments: p.comments,
    note: p.note,
    img: p.img,
  }));

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [city, setCity] = useState<CityKey>('sf');
  const [items, setItems] = useState<Item[]>(() => ITEMS.map((i) => ({ ...i })));
  const [feed, setFeed] = useState<FeedRow[]>(() => localFeed(ITEMS));
  const [connection, setConnection] = useState<Connection>('connecting');

  const online = connection === 'online';

  /** Pull the catalogue, the caller's rankings, and the feed from the API. */
  const refresh = useCallback(async () => {
    try {
      const [catalogue, rankings, remoteFeed] = await Promise.all([
        api.items(token),
        api.rankings(token),
        api.feed(token),
      ]);
      const merged = catalogue.map((i) => {
        const r = rankings.find((x) => x.item_id === i.id);
        return r ? { ...i, tier: r.tier, score: r.score } : i;
      });
      setItems(merged);
      setFeed(
        remoteFeed.map((f) => ({
          id: f.id,
          userName: f.user_name,
          userColor: f.user_color,
          item: merged.find((i) => i.id === f.item.id) ?? { ...i0(f.item) },
          score: f.score,
          action: f.action,
          time: f.time,
          likes: f.likes,
          comments: f.comments,
          note: f.note,
          img: f.img,
        }))
      );
      setConnection('online');
    } catch {
      // API down: keep the bundled seed so the app is still usable.
      setConnection('offline');
      setItems(ITEMS.map((i) => ({ ...i })));
      setFeed(localFeed(ITEMS));
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const ranked = useCallback(
    (c: CityKey) => items.filter((i) => i.city === c && i.score != null).sort((a, b) => b.score! - a.score!),
    [items]
  );
  const wants = useCallback((c: CityKey) => items.filter((i) => i.city === c && i.score == null), [items]);

  // ---- Local ranking, used only when the API is unreachable ----------------

  const [localSession, setLocalSession] = useState<{ itemId: number; tier: Tier; pool: number[]; lo: number; hi: number; n: number } | null>(null);

  const localCommit = useCallback(
    (itemId: number, tier: Tier, pos: number): RankState => {
      const target = items.find((i) => i.id === itemId)!;
      const pool = items
        .filter((i) => i.city === target.city && i.tier === tier && i.score != null && i.id !== itemId)
        .sort((a, b) => b.score! - a.score!)
        .map((i) => i.id);
      pool.splice(Math.min(pos, pool.length), 0, itemId);

      const [min, max] = TIERS[tier].range;
      const step = pool.length > 1 ? (max - min) / (pool.length - 1) : 0;
      const scores: Record<number, number> = {};
      pool.forEach((id, idx) => {
        scores[id] = pool.length > 1 ? +(max - step * idx).toFixed(1) : +((min + max) / 2).toFixed(1);
      });

      const next = items.map((i) => (scores[i.id] != null ? { ...i, tier, score: scores[i.id] } : i));
      setItems(next);

      const cityList = next.filter((i) => i.city === target.city && i.score != null).sort((a, b) => b.score! - a.score!);
      return {
        sessionId: '',
        done: true,
        comparison: 0,
        opponent: null,
        opponentRank: null,
        opponentScore: null,
        item: { ...target, tier, score: scores[itemId] },
        score: scores[itemId],
        rank: cityList.findIndex((i) => i.id === itemId) + 1,
        total: cityList.length,
      };
    },
    [items]
  );

  const localDuel = useCallback(
    (session: { itemId: number; tier: Tier; pool: number[]; lo: number; hi: number; n: number }): RankState => {
      const mid = Math.floor((session.lo + session.hi) / 2);
      const opponent = items.find((i) => i.id === session.pool[mid])!;
      const cityList = ranked(opponent.city);
      return {
        sessionId: 'local',
        done: false,
        comparison: session.n,
        opponent,
        opponentRank: cityList.findIndex((i) => i.id === opponent.id) + 1,
        opponentScore: opponent.score,
        item: null,
        score: null,
        rank: null,
        total: null,
      };
    },
    [items, ranked]
  );

  // ---- Public ranking API -------------------------------------------------

  const rankStart = useCallback(
    async (itemId: number, tier: Tier): Promise<RankState> => {
      if (online) {
        const state = await api.rankStart(token, itemId, tier);
        if (state.done) await refresh();
        return state;
      }
      const target = items.find((i) => i.id === itemId)!;
      const pool = ranked(target.city).filter((i) => i.tier === tier && i.id !== itemId).map((i) => i.id);
      if (!pool.length) return localCommit(itemId, tier, 0);
      const session = { itemId, tier, pool, lo: 0, hi: pool.length, n: 1 };
      setLocalSession(session);
      return localDuel(session);
    },
    [online, token, refresh, items, ranked, localCommit, localDuel]
  );

  const rankCompare = useCallback(
    async (sessionId: string, winner: 'new' | 'opponent'): Promise<RankState> => {
      if (online) {
        const state = await api.rankCompare(token, sessionId, winner);
        if (state.done) await refresh();
        return state;
      }
      const s = localSession!;
      const mid = Math.floor((s.lo + s.hi) / 2);
      const next = { ...s, lo: winner === 'new' ? s.lo : mid + 1, hi: winner === 'new' ? mid : s.hi, n: s.n + 1 };
      if (next.lo >= next.hi) {
        setLocalSession(null);
        return localCommit(s.itemId, s.tier, next.lo);
      }
      setLocalSession(next);
      return localDuel(next);
    },
    [online, token, refresh, localSession, localCommit, localDuel]
  );

  const saveNote = useCallback(
    async (itemId: number, note: string) => {
      if (!online || !note.trim()) return;
      try {
        await api.setNote(token, itemId, note.trim());
        await refresh();
      } catch {
        /* a note is not worth blocking the flow over */
      }
    },
    [online, token, refresh]
  );

  const value = useMemo<Ctx>(
    () => ({ city, setCity, items, feed, connection, ranked, wants, rankStart, rankCompare, saveNote, refresh }),
    [city, items, feed, connection, ranked, wants, rankStart, rankCompare, saveNote, refresh]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Fallback conversion for a feed item missing from the catalogue. */
function i0(a: any): Item {
  return toItem(a);
}
