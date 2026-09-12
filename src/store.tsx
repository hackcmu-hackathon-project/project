import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CityKey, ITEMS, Item } from './data';
import { TIERS, Tier } from './theme';
import { Me, RankState, api, toItem } from './api';
import { useAuth } from './auth';

export type Connection = 'connecting' | 'online' | 'offline';

export type FeedRow = {
  id: string;
  userSub: string | null;
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
  reactions: Record<string, number>;
  myReaction: string | null;
  saved: boolean;
};

type Ctx = {
  /** The signed-in account as the API knows it — created on first call. */
  me: Me | null;
  city: CityKey;
  setCity: (c: CityKey) => void;
  items: Item[];
  feed: FeedRow[];
  connection: Connection;
  /** Whose rankings the feed shows. */
  feedScope: 'following' | 'everyone';
  setFeedScope: (s: 'following' | 'everyone') => void;
  ranked: (city: CityKey) => Item[];
  /** Items you saved to "want to go", newest first. */
  saves: Item[];
  toggleSave: (itemId: number) => Promise<void>;
  /** Drop your ranking of an item; the rest of that tier re-spreads on the server. */
  unrank: (itemId: number) => Promise<void>;
  /** Add a place that isn't in the catalogue yet. Returns it once the API has it. */
  createItem: (body: { city: CityKey; title: string; hood: string; category: string; note?: string }) => Promise<Item>;
  /** Set or clear your reaction on someone's ranking. Tapping the same emoji clears it. */
  react: (owner: string, itemId: number, emoji: string) => Promise<void>;
  isSaved: (itemId: number) => boolean;
  /** Every item in the city you haven't ranked — the pool the rank flow picks from. */
  wants: (city: CityKey) => Item[];
  /** Open a ranking session for an item in a tier. Resolves to the first duel, or straight to a result. */
  rankStart: (itemId: number, tier: Tier) => Promise<RankState>;
  rankCompare: (sessionId: string, winner: 'new' | 'opponent') => Promise<RankState>;
  saveNote: (itemId: number, note: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const C = createContext<Ctx>(null as any);
export const useStore = () => useContext(C);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [city, setCity] = useState<CityKey>('sf');
  const [items, setItems] = useState<Item[]>(() => ITEMS.map((i) => ({ ...i })));
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [saves, setSaves] = useState<Item[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [feedScope, setFeedScope] = useState<'following' | 'everyone'>('following');

  const online = connection === 'online';

  /** Pull the catalogue, the caller's rankings, and the feed from the API. */
  const refresh = useCallback(async () => {
    try {
      // /api/me upserts the account — for a brand-new Auth0 user this call is
      // what creates them, so it has to happen on every launch, not just when
      // the profile tab is opened.
      const [profile, catalogue, rankings, remoteFeed, savedItems] = await Promise.all([
        api.me(token).catch(() => null),
        api.items(token),
        api.rankings(token),
        api.feed(token, feedScope),
        api.saves(token),
      ]);
      const merged = catalogue.map((i) => {
        const r = rankings.find((x) => x.item_id === i.id);
        return r ? { ...i, tier: r.tier, score: r.score } : i;
      });
      setMe(profile);
      setItems(merged);
      setSaves(savedItems.map(toItem).map((i) => merged.find((m) => m.id === i.id) ?? i));
      setFeed(
        remoteFeed.map((f) => ({
          id: f.id,
          userSub: f.user_sub,
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
          reactions: f.reactions ?? {},
          myReaction: f.my_reaction ?? null,
          saved: f.saved ?? false,
        }))
      );
      setConnection('online');
    } catch {
      // API down: keep the bundled seed so the app is still usable.
      setConnection('offline');
      setMe(null);
      setItems(ITEMS.map((i) => ({ ...i })));
      setFeed([]);
      setSaves([]);
    }
  }, [token, feedScope]);

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

  const toggleSave = useCallback(
    async (itemId: number) => {
      if (!online) return;
      const already = saves.some((s) => s.id === itemId);
      // Optimistic, so the button responds instantly.
      setSaves((prev) =>
        already ? prev.filter((s) => s.id !== itemId) : [items.find((i) => i.id === itemId)!, ...prev]
      );
      setFeed((prev) => prev.map((f) => (f.item.id === itemId ? { ...f, saved: !already } : f)));
      try {
        if (already) await api.unsave(token, itemId);
        else await api.save(token, itemId);
      } catch {
        refresh();
      }
    },
    [online, saves, items, token, refresh]
  );

  const unrank = useCallback(
    async (itemId: number) => {
      if (!online) return;
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, tier: null, score: null } : i)));
      try {
        await api.unrank(token, itemId);
      } finally {
        // Removing one ranking rescores its whole tier, so take the server's word for it.
        refresh();
      }
    },
    [online, token, refresh]
  );

  const createItem = useCallback(
    async (body: { city: CityKey; title: string; hood: string; category: string; note?: string }) => {
      const created = await api.createItem(token, body);
      setItems((prev) => [...prev, created]);
      return created;
    },
    [token]
  );

  const react = useCallback(
    async (owner: string, itemId: number, emoji: string) => {
      if (!online) return;
      let clearing = false;
      setFeed((prev) =>
        prev.map((f) => {
          if (f.userSub !== owner || f.item.id !== itemId) return f;
          const counts = { ...f.reactions };
          if (f.myReaction) counts[f.myReaction] = Math.max(0, (counts[f.myReaction] ?? 1) - 1);
          clearing = f.myReaction === emoji;
          if (!clearing) counts[emoji] = (counts[emoji] ?? 0) + 1;
          return { ...f, reactions: counts, myReaction: clearing ? null : emoji };
        })
      );
      try {
        if (clearing) await api.unreact(token, owner, itemId);
        else await api.react(token, owner, itemId, emoji);
      } catch {
        refresh();
      }
    },
    [online, token, refresh]
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
    () => ({
      me,
      city,
      setCity,
      items,
      feed,
      connection,
      feedScope,
      setFeedScope,
      ranked,
      saves,
      toggleSave,
      unrank,
      createItem,
      react,
      isSaved: (id: number) => saves.some((s) => s.id === id),
      wants,
      rankStart,
      rankCompare,
      saveNote,
      refresh,
    }),
    [me, city, items, feed, connection, feedScope, ranked, saves, toggleSave, unrank, createItem, react, wants, rankStart, rankCompare, saveNote, refresh]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Fallback conversion for a feed item missing from the catalogue. */
function i0(a: any): Item {
  return toItem(a);
}
