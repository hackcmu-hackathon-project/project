import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { CATEGORIES, colors, font, radius, scoreColors, fmtScore, TIERS, TIER_ORDER, Tier } from '../theme';
import { CITIES, CityKey, meta } from '../data';
import { RankState } from '../api';
import { CityChips, Eyebrow, Photo, Row, T, Touch } from '../components/ui';
import { PickedPhoto, pickPhoto } from '../photoPicker';
import { useStore } from '../store';

type Step = 'pick' | 'new' | 'tier' | 'compare' | 'done';

export function Rank({ top, seedId, onFinish }: { top: number; seedId?: number; onFinish: () => void }) {
  const { city, setCity, items, wants, rankStart, rankCompare, saveNote, createItem, uploadPhoto } = useStore();
  const [step, setStep] = useState<Step>(seedId ? 'tier' : 'pick');
  const [newId, setNewId] = useState<number | null>(seedId ?? null);
  const [state, setState] = useState<RankState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<{
    title: string;
    hood: string;
    category: string;
    note: string;
    tip: string;
    bestTime: string;
    city: CityKey;
  }>({ title: '', hood: '', category: 'Outdoors', note: '', tip: '', bestTime: '', city });
  const [picked, setPicked] = useState<PickedPhoto | null>(null);

  const newItem = items.find((i) => i.id === newId) ?? state?.item ?? null;
  const candidates = useMemo(
    () =>
      wants(city)
        .filter((c) => {
          if (!q) return true;
          const needle = q.toLowerCase();
          return (
            c.title.toLowerCase().includes(needle) ||
            c.hood.toLowerCase().includes(needle) ||
            c.category.toLowerCase().includes(needle)
          );
        })
        .slice(0, 40),
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
        <Touch
          onPress={() => { setDraft((d) => ({ ...d, title: q, city })); setStep('new'); }}
          style={{ marginHorizontal: 22, marginBottom: 20, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.plum, alignItems: 'center', justifyContent: 'center' }}>
            <T size={17} c="#fff">＋</T>
          </View>
          <View style={{ flex: 1 }}>
            <T s="med" size={14.5}>Add a new place</T>
            <T s="soft" size={12.5} style={{ marginTop: 2 }}>
              Not in the catalogue yet? Add it for everyone.
            </T>
          </View>
        </Touch>
        <Eyebrow style={{ paddingHorizontal: 22, paddingBottom: 8 }}>
          {q ? `${candidates.length} match${candidates.length === 1 ? '' : 'es'}` : 'Things you haven’t ranked'}
        </Eyebrow>
        {candidates.map((c) => (
          <Touch
            key={c.id}
            onPress={() => { setNewId(c.id); setStep('tier'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#ebe6df' }}
          >
            <Photo uri={c.photoThumb ?? c.photo} label={c.title} radius={10} style={{ width: 48, height: 48 }} />
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
          <T s="soft" size={14} style={{ padding: 22, lineHeight: 21 }}>
            {q ? `Nothing in the catalogue matches “${q}”. Add it above.` : 'You’ve ranked everything here. Go do something new.'}
          </T>
        ) : null}
      </ScrollView>
    );
  }

  // ---------- Add a place ----------
  if (step === 'new') {
    const ready = draft.title.trim().length > 2 && draft.hood.trim().length > 1;
    const field = (
      label: string,
      key: 'title' | 'hood' | 'note' | 'tip' | 'bestTime',
      placeholder: string,
      multiline = false
    ) => (
      <View key={key} style={{ marginBottom: 14 }}>
        <Eyebrow style={{ fontSize: 11, marginBottom: 6 }}>{label}</Eyebrow>
        <View style={{ paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
          <TextInput
            value={draft[key]}
            onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
            placeholder={placeholder}
            placeholderTextColor={colors.faint}
            multiline={multiline}
            style={{ paddingVertical: 12, minHeight: multiline ? 72 : undefined, fontFamily: font.body, fontSize: 15, color: colors.ink, outlineStyle: 'none' } as any}
          />
        </View>
      </View>
    );

    return (
      <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <T s="serif" size={34} style={{ paddingHorizontal: 22 }}>Add a place</T>
        <T s="soft" size={14} style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 20 }}>
          It joins the catalogue for everyone, and we’ll find a photo for it.
        </T>
        <View style={{ paddingHorizontal: 22 }}>
          <Eyebrow style={{ fontSize: 11, marginBottom: 8 }}>Photo</Eyebrow>
          <Touch
            onPress={async () => setPicked((await pickPhoto()) ?? picked)}
            label="Choose a photo"
            style={{ marginBottom: 16, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}
          >
            <Photo uri={picked?.uri} label={draft.title || '?'} style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
              {!picked ? (
                <View style={{ alignItems: 'center' }}>
                  <T s="med" size={14}>Add a photo</T>
                  <T s="soft" size={12} style={{ marginTop: 3 }}>Optional — we'll find one if you don't</T>
                </View>
              ) : null}
            </Photo>
          </Touch>
          {picked ? (
            <Row style={{ gap: 14, marginTop: -8, marginBottom: 14 }}>
              <Touch onPress={async () => setPicked((await pickPhoto()) ?? picked)}>
                <T s="med" size={13} c={colors.plum}>Choose another</T>
              </Touch>
              <Touch onPress={() => setPicked(null)}>
                <T s="soft" size={13}>Remove</T>
              </Touch>
            </Row>
          ) : null}

          <Eyebrow style={{ fontSize: 11, marginBottom: 8 }}>Which city</Eyebrow>
          <View style={{ marginBottom: 16 }}>
            <CityChips city={draft.city} onChange={(c) => setDraft((d) => ({ ...d, city: c }))} />
          </View>
          {field('What is it', 'title', 'Sunrise from the overlook')}
          {field('Neighborhood', 'hood', 'Which part of town')}
          <Eyebrow style={{ fontSize: 11, marginBottom: 8 }}>Kind of thing</Eyebrow>
          <Row style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {CATEGORIES.map((c) => (
              <Touch
                key={c}
                onPress={() => setDraft((d) => ({ ...d, category: c }))}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: draft.category === c ? colors.ink : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <T s="med" size={13} c={draft.category === c ? '#fff' : colors.ink}>{c}</T>
              </Touch>
            ))}
          </Row>
          {field('Why it’s worth doing', 'note', 'One or two lines for whoever finds it next.', true)}
          {field('The move (optional)', 'tip', 'The thing you’d tell a friend before they go.')}
          {field('Best time (optional)', 'bestTime', 'Weekday mornings')}
          {error ? <T s="soft" size={12.5} c={colors.plum} style={{ marginBottom: 10 }}>{error}</T> : null}
          <Touch
            onPress={async () => {
              if (!ready || busy) return;
              setBusy(true);
              setError(null);
              try {
                const created = await createItem({
                  city: draft.city,
                  title: draft.title.trim(),
                  hood: draft.hood.trim(),
                  category: draft.category,
                  note: draft.note.trim(),
                  tip: draft.tip.trim(),
                  best_time: draft.bestTime.trim(),
                });
                if (picked) {
                  // A failed upload shouldn't lose the place they just added.
                  try {
                    await uploadPhoto(created.id, picked);
                  } catch {
                    setError('Added, but the photo didn’t upload.');
                  }
                }
                // Rank it in the city it was added to, not the one you were browsing.
                if (draft.city !== city) setCity(draft.city);
                setNewId(created.id);
                setStep('tier');
              } catch (e: any) {
                setError('Could not add it — is the API running?');
              } finally {
                setBusy(false);
              }
            }}
            style={{ padding: 16, borderRadius: radius.lg, backgroundColor: ready ? colors.ink : colors.chip, alignItems: 'center' }}
          >
            <T s="med" size={15} c={ready ? '#fff' : colors.faint}>{busy ? 'Adding…' : 'Add it, then rank it'}</T>
          </Touch>
          <Touch onPress={() => setStep('pick')} style={{ padding: 16, alignItems: 'center' }}>
            <T s="soft" size={14}>Back to search</T>
          </Touch>
        </View>
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
          <Contender photo={newItem.photo ?? newItem.photoThumb} label={newItem.title} onPress={() => !busy && compare('new')}>
            <Eyebrow style={{ color: colors.plum, fontSize: 11, marginBottom: 6 }}>New</Eyebrow>
            <T s="serif" size={22} style={{ lineHeight: 25 }}>{newItem.title}</T>
          </Contender>
          <T s="soft" size={12} style={{ textAlign: 'center', color: colors.faint }}>vs</T>
          <Contender photo={old.photo ?? old.photoThumb} label={old.title} onPress={() => !busy && compare('opponent')}>
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

function Contender({ children, onPress, photo, label }: any) {
  return (
    <Touch onPress={onPress} style={{ flex: 1, minHeight: 190 }}>
      <View style={{ flex: 1, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        <Photo uri={photo} label={label} style={{ flex: 1, minHeight: 110 }} />
        <View style={{ padding: 16 }}>{children}</View>
      </View>
    </Touch>
  );
}
