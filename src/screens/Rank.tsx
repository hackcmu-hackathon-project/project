import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { colors, font, radius, scoreColors, fmtScore, TIERS, TIER_ORDER, Tier } from '../theme';
import { CITIES, meta } from '../data';
import { RankState } from '../api';
import { Eyebrow, Hatch, Row, T, Touch } from '../components/ui';
import { useStore } from '../store';

type Step = 'pick' | 'tier' | 'compare' | 'done';

export function Rank({ top, seedId, onFinish }: { top: number; seedId?: number; onFinish: () => void }) {
  const { city, items, ranked, wants, rankStart, rankCompare, saveNote } = useStore();
  const [step, setStep] = useState<Step>(seedId ? 'tier' : 'pick');
  const [newId, setNewId] = useState<number | null>(seedId ?? null);
  const [state, setState] = useState<RankState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');

  const newItem = items.find((i) => i.id === newId) ?? state?.item ?? null;
  const candidates = useMemo(
    () => wants(city).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase())),
    [wants, city, q]
  );

  const advance = async (run: () => Promise<RankState>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await run();
      setState(next);
      setStep(next.done ? 'done' : 'compare');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const chooseTier = (t: Tier) => advance(() => rankStart(newId!, t));
  const compare = (winner: 'new' | 'opponent') => advance(() => rankCompare(state!.sessionId, winner));

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
              <T s="soft" size={12} style={{ marginTop: 3 }}>{meta(c)}</T>
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
                onPress={() => !busy && chooseTier(t)}
                style={{ padding: 20, borderRadius: radius.xl, backgroundColor: bg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: busy ? 0.6 : 1 }}
              >
                <T s="med" size={17} c={fg}>{TIERS[t].label}</T>
                <T size={13} c={fg} style={{ opacity: 0.75 }}>{TIERS[t].hint}</T>
              </Touch>
            );
          })}
        </View>
        {error ? <T s="soft" size={12} c={colors.plum} style={{ padding: 22 }}>{error}</T> : null}
        <Touch onPress={onFinish} style={{ marginTop: 'auto', padding: 20, alignItems: 'center' }}>
          <T s="soft" size={14}>Cancel</T>
        </Touch>
      </View>
    );
  }

  // ---------- Compare ----------
  if (step === 'compare' && state?.opponent && newItem) {
    const old = state.opponent;
    return (
      <View style={{ flex: 1, paddingTop: top + 8, paddingBottom: 100 }}>
        <T s="soft" size={13} style={{ paddingHorizontal: 22 }}>Comparison {state.comparison}</T>
        <T s="serif" size={30} style={{ paddingHorizontal: 22, paddingTop: 2, paddingBottom: 24 }}>Which was better?</T>
        <View style={{ flex: 1, paddingHorizontal: 22, gap: 12, opacity: busy ? 0.55 : 1 }}>
          <Contender onPress={() => !busy && compare('new')}>
            <Eyebrow style={{ color: colors.plum, fontSize: 11, marginBottom: 6 }}>New</Eyebrow>
            <T s="serif" size={22} style={{ lineHeight: 25 }}>{newItem.title}</T>
          </Contender>
          <T s="soft" size={12} style={{ textAlign: 'center', color: colors.faint }}>vs</T>
          <Contender onPress={() => !busy && compare('opponent')}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Eyebrow style={{ color: colors.soft, fontSize: 11 }}>Ranked #{state.opponentRank ?? '–'}</Eyebrow>
              <T s="semi" size={13}>{fmtScore(state.opponentScore)}</T>
            </Row>
            <T s="serif" size={22} style={{ lineHeight: 25 }}>{old.title}</T>
          </Contender>
        </View>
        <Touch onPress={() => !busy && compare(Math.random() < 0.5 ? 'new' : 'opponent')} style={{ padding: 20, alignItems: 'center' }}>
          <T s="soft" size={14}>Too close to call</T>
        </Touch>
      </View>
    );
  }

  // ---------- Done ----------
  if (step === 'done' && state) {
    const [bg, fg] = scoreColors(state.score);
    return (
      <View style={{ flex: 1, paddingTop: top + 8, paddingBottom: 110 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
            <T s="serif" size={40} c={fg}>{fmtScore(state.score)}</T>
          </View>
          <T s="serif" size={30} style={{ textAlign: 'center', lineHeight: 33, marginBottom: 8 }}>{state.item?.title ?? newItem?.title}</T>
          <T s="soft" size={14}>Now #{state.rank} of {state.total} in {CITIES[city]}</T>
        </View>
        <View style={{ paddingHorizontal: 22, gap: 10 }}>
          <View style={{ paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note for friends…"
              placeholderTextColor={colors.faint}
              style={{ paddingVertical: 14, fontFamily: font.body, fontSize: 14, color: colors.ink, outlineStyle: 'none' } as any}
            />
          </View>
          <Touch
            onPress={async () => { await saveNote(state.item?.id ?? newId!, note); onFinish(); }}
            style={{ padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}
          >
            <T s="med" size={15} c="#fff">Post to feed</T>
          </Touch>
          <Touch onPress={onFinish} style={{ padding: 12, alignItems: 'center' }}>
            <T s="soft" size={14}>Keep private</T>
          </Touch>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.plum} />
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
