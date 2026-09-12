import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { colors, font, radius, scoreColors, fmtScore, TIERS, TIER_ORDER, Tier } from '../theme';
import { CITIES, Item } from '../data';
import { Eyebrow, Hatch, Row, T, Touch } from '../components/ui';
import { useStore } from '../store';

type Step = 'pick' | 'tier' | 'compare' | 'done';

export function Rank({ top, seedId, onFinish }: { top: number; seedId?: number; onFinish: () => void }) {
  const { city, items, ranked, wants, applyRanking } = useStore();
  const [step, setStep] = useState<Step>(seedId ? 'tier' : 'pick');
  const [newId, setNewId] = useState<number | null>(seedId ?? null);
  const [tier, setTier] = useState<Tier | null>(null);
  const [bounds, setBounds] = useState({ lo: 0, hi: 0, n: 1 });
  const [newScore, setNewScore] = useState<number | null>(null);
  const [q, setQ] = useState('');

  const newItem = items.find((i) => i.id === newId) ?? null;
  const candidates = useMemo(
    () => wants(city).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase())),
    [wants, city, q]
  );
  const pool = useMemo(
    () => (tier ? ranked(city).filter((i) => i.tier === tier && i.id !== newId) : []),
    [ranked, city, tier, newId]
  );

  const finish = (t: Tier, pos: number) => {
    const s = applyRanking(newId!, t, pos);
    setNewScore(s);
    setStep('done');
  };

  const chooseTier = (t: Tier) => {
    setTier(t);
    const p = ranked(city).filter((i) => i.tier === t && i.id !== newId);
    if (!p.length) {
      const s = applyRanking(newId!, t, 0);
      setNewScore(s);
      setStep('done');
      return;
    }
    setBounds({ lo: 0, hi: p.length, n: 1 });
    setStep('compare');
  };

  const compare = (newWins: boolean) => {
    const mid = Math.floor((bounds.lo + bounds.hi) / 2);
    const lo = newWins ? bounds.lo : mid + 1;
    const hi = newWins ? mid : bounds.hi;
    if (lo >= hi) return finish(tier!, lo);
    setBounds({ lo, hi, n: bounds.n + 1 });
  };

  // ---------- Pick ----------
  if (step === 'pick') {
    return (
      <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <T s="serif" size={36} style={{ paddingHorizontal: 22, paddingBottom: 4 }}>Rank something</T>
        <T s="soft" size={14} style={{ paddingHorizontal: 22, paddingBottom: 16 }}>What did you do in {CITIES[city]}?</T>
        <View style={{ marginHorizontal: 22, marginBottom: 18, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search experiences or itineraries"
            placeholderTextColor={colors.faint}
            style={{ paddingVertical: 12, fontFamily: font.body, fontSize: 15, color: colors.ink, outlineStyle: 'none' } as any}
          />
        </View>
        <Eyebrow style={{ paddingHorizontal: 22, paddingBottom: 8 }}>Popular right now</Eyebrow>
        {candidates.map((c) => (
          <Touch
            key={c.id}
            onPress={() => { setNewId(c.id); setStep('tier'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#ebe6df' }}
          >
            <Hatch style={{ width: 48, height: 48, borderRadius: 10 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T s="med" size={15} style={{ lineHeight: 19 }}>{c.title}</T>
              <T s="soft" size={12} style={{ marginTop: 3 }}>{c.hood} · {c.stops} stops · {c.hours}h</T>
            </View>
            <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#cfc8bf', alignItems: 'center', justifyContent: 'center' }}>
              <T size={16} c={colors.plum}>＋</T>
            </View>
          </Touch>
        ))}
        {candidates.length === 0 ? (
          <T s="soft" size={14} style={{ padding: 22 }}>You’ve ranked everything here. Go do something new.</T>
        ) : null}
      </ScrollView>
    );
  }

  // ---------- Tier ----------
  if (step === 'tier' && newItem) {
    return (
      <View style={{ flex: 1, paddingTop: top + 8, paddingBottom: 110 }}>
        <T s="soft" size={13} style={{ paddingHorizontal: 22 }}>Ranking</T>
        <T s="serif" size={30} style={{ paddingHorizontal: 22, paddingTop: 2, paddingBottom: 28, lineHeight: 33 }}>{newItem.title}</T>
        <T s="soft" size={14} style={{ paddingHorizontal: 22, paddingBottom: 12 }}>How was it?</T>
        <View style={{ paddingHorizontal: 22, gap: 10 }}>
          {TIER_ORDER.map((t) => {
            const bg = t === 'loved' ? colors.plum : t === 'liked' ? colors.gold : colors.chip;
            const fg = t === 'loved' ? '#fff' : colors.ink;
            return (
              <Touch
                key={t}
                onPress={() => chooseTier(t)}
                style={{ padding: 20, borderRadius: radius.xl, backgroundColor: bg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <T s="med" size={17} c={fg}>{TIERS[t].label}</T>
                <T size={13} c={fg} style={{ opacity: 0.75 }}>{TIERS[t].hint}</T>
              </Touch>
            );
          })}
        </View>
        <Touch onPress={onFinish} style={{ marginTop: 'auto', padding: 20, alignItems: 'center' }}>
          <T s="soft" size={14}>Cancel</T>
        </Touch>
      </View>
    );
  }

  // ---------- Compare ----------
  if (step === 'compare' && newItem) {
    const mid = Math.floor((bounds.lo + bounds.hi) / 2);
    const old = pool[Math.min(mid, pool.length - 1)] ?? pool[0];
    const oldRank = ranked(city).findIndex((r) => r.id === old.id) + 1;
    return (
      <View style={{ flex: 1, paddingTop: top + 8, paddingBottom: 100 }}>
        <T s="soft" size={13} style={{ paddingHorizontal: 22 }}>Comparison {bounds.n}</T>
        <T s="serif" size={30} style={{ paddingHorizontal: 22, paddingTop: 2, paddingBottom: 24 }}>Which was better?</T>
        <View style={{ flex: 1, paddingHorizontal: 22, gap: 12 }}>
          <Contender onPress={() => compare(true)}>
            <Eyebrow style={{ color: colors.plum, fontSize: 11, marginBottom: 6 }}>New</Eyebrow>
            <T s="serif" size={22} style={{ lineHeight: 25 }}>{newItem.title}</T>
          </Contender>
          <T s="soft" size={12} style={{ textAlign: 'center', color: colors.faint }}>vs</T>
          <Contender onPress={() => compare(false)}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Eyebrow style={{ color: colors.soft, fontSize: 11 }}>Ranked #{oldRank}</Eyebrow>
              <T s="semi" size={13}>{fmtScore(old.score)}</T>
            </Row>
            <T s="serif" size={22} style={{ lineHeight: 25 }}>{old.title}</T>
          </Contender>
        </View>
        <Touch onPress={() => compare(Math.random() < 0.5)} style={{ padding: 20, alignItems: 'center' }}>
          <T s="soft" size={14}>Too close to call</T>
        </Touch>
      </View>
    );
  }

  // ---------- Done ----------
  const [bg, fg] = scoreColors(newScore);
  const list = ranked(city);
  const rank = list.findIndex((r) => r.id === newId) + 1;
  return (
    <View style={{ flex: 1, paddingTop: top + 8, paddingBottom: 110 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <T s="serif" size={40} c={fg}>{fmtScore(newScore)}</T>
        </View>
        <T s="serif" size={30} style={{ textAlign: 'center', lineHeight: 33, marginBottom: 8 }}>{newItem?.title}</T>
        <T s="soft" size={14}>Now #{rank} of {list.length} in {CITIES[city]}</T>
      </View>
      <View style={{ paddingHorizontal: 22, gap: 10 }}>
        <View style={{ paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
          <TextInput
            placeholder="Add a note for friends…"
            placeholderTextColor={colors.faint}
            style={{ paddingVertical: 14, fontFamily: font.body, fontSize: 14, color: colors.ink, outlineStyle: 'none' } as any}
          />
        </View>
        <Touch onPress={onFinish} style={{ padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}>
          <T s="med" size={15} c="#fff">Post to feed</T>
        </Touch>
        <Touch onPress={onFinish} style={{ padding: 12, alignItems: 'center' }}>
          <T s="soft" size={14}>Keep private</T>
        </Touch>
      </View>
    </View>
  );
}

function Contender({ children, onPress }: any) {
  return (
    <Touch onPress={onPress} style={{ flex: 1, minHeight: 170 }}>
      <View style={{ flex: 1, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 18, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <Hatch style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }} />
        <View>{children}</View>
      </View>
    </Touch>
  );
}
