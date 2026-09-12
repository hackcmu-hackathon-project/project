import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { CATEGORIES, colors, font, radius, scoreColors, fmtScore, TIERS, TIER_ORDER, Tier } from '../theme';
import { CITIES, CityKey, meta } from '../data';
import { RankState, api } from '../api';
import { useAuth } from '../auth';
import { CityChips, Eyebrow, Photo, Row, T, Touch } from '../components/ui';
import { MiniMap } from '../components/MiniMap';
import { PickedPhoto, pickPhotos } from '../photoPicker';
import { useStore } from '../store';

type Step = 'pick' | 'new' | 'tier' | 'compare' | 'done';

export function Rank({ top, seedId, onFinish }: { top: number; seedId?: number; onFinish: () => void }) {
  const { token } = useAuth();
  const { city, setCity, items, wants, rankStart, rankCompare, saveNote, createItem, refresh, connection, me } = useStore();
  const [step, setStep] = useState<Step>(seedId ? 'tier' : 'pick');
  const [newId, setNewId] = useState<number | null>(seedId ?? null);
  const [state, setState] = useState<RankState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [located, setLocated] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [hints, setHints] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [draft, setDraft] = useState<{
    title: string;
    address: string;
    category: string;
    note: string;
    bestTime: string;
    city: CityKey;
  }>({ title: '', address: '', category: 'Outdoors', note: '', bestTime: '', city });
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const photoEditor = (
    <View style={{ gap: 10, marginBottom: 18 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T s="med" size={14}>Your moments · {picked.length}/10</T>
        <Touch disabled={busy || picked.length >= 10} onPress={async () => {
          try {
            const photos = await pickPhotos(10 - picked.length);
            setPicked(previous => [...previous, ...photos].slice(0, 10));
          } catch { setError('Could not open your photos. Please try again.'); }
        }}><T c={colors.plum} size={13}>＋ Add photos</T></Touch>
      </Row>
      <T s="soft" size={12}>Choose up to 10 photos for your ranking. They’ll appear with your note, not replace the place cover.</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row style={{ gap: 8 }}>
          {picked.map((photo, index) => (
            <View key={`${photo.uri}-${index}`}>
              <Photo uri={photo.uri} radius={10} style={{ width: 100, height: 100 }} />
              <Touch disabled={busy} label={`Remove photo ${index + 1}`} onPress={() => setPicked(p => p.filter((_, i) => i !== index))} style={{ paddingVertical: 6 }}>
                <T s="soft" size={12}>Remove {index + 1}</T>
              </Touch>
            </View>
          ))}
        </Row>
      </ScrollView>
    </View>
  );

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

  useEffect(() => {
    const address = draft.address.trim();
    // Once something is chosen, the field matches it — don't re-suggest it.
    if (step !== 'new' || address.length < 2 || address === located?.label) {
      setHints([]);
      return;
    }
    let alive = true;
    setLocating(true);
    const timer = setTimeout(() => {
      api
        .suggestPlaces(token, address, draft.city)
        .then((rows) => alive && setHints(rows))
        .catch(() => alive && setHints([]))
        .finally(() => alive && setLocating(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [draft.address, draft.city, step, token, located]);

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

  const chooseTier = (t: Tier) => { setSelectedTier(t); return advance(() => rankStart(newId!, t)); };
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
    const ready = draft.title.trim().length > 2 && Boolean(located);
    const missing = !draft.title.trim().length
      ? 'Give it a name'
      : draft.title.trim().length <= 2
        ? 'That name is a bit short'
        : draft.address.trim().length <= 2
            ? 'Search for where it is'
            : locating
              ? 'Checking that address…'
              : !located
                ? 'Pick one of the suggestions so we know where it is'
                : '';
    const field = (
      label: string,
      key: 'title' | 'address' | 'note' | 'bestTime',
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
        <View style={{ paddingHorizontal: 22 }}>
          {photoEditor}
          <Eyebrow style={{ fontSize: 11, marginBottom: 8 }}>Which city</Eyebrow>
          <View style={{ marginBottom: 16 }}>
            <CityChips
              city={draft.city}
              onChange={(c) => { setDraft((d) => ({ ...d, city: c, address: '' })); setLocated(null); }}
            />
          </View>
          {field('What is it', 'title', 'Sunrise from the overlook')}
          {field('Where is it', 'address', 'Search a place or address')}
          <View style={{ marginTop: -8, marginBottom: 14, gap: 8 }}>
            {hints.length ? (
              <View style={{ borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                {hints.map((hint) => (
                  <Touch
                    key={`${hint.label}-${hint.lat}`}
                    onPress={() => {
                      setLocated(hint);
                      setDraft((d) => ({ ...d, address: hint.label }));
                      setHints([]);
                    }}
                    style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.hair }}
                  >
                    <T size={14}>{hint.label}</T>
                  </Touch>
                ))}
              </View>
            ) : null}

            {located ? (
              <>
                <MiniMap
                  lat={located.lat}
                  lon={located.lon}
                  draggable
                  onMove={(point) => setLocated((current) => (current ? { ...current, ...point } : current))}
                />
                <T s="soft" size={12} style={{ color: colors.faint, lineHeight: 17 }}>
                  Drag the pin if it's not quite right.
                </T>
              </>
            ) : (
              <T s="soft" size={12} style={{ color: colors.faint, lineHeight: 17 }}>
                {locating ? 'Searching…' : 'Search for the place or its address, then check the pin.'}
              </T>
            )}
          </View>
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
          {field('Why it’s worth doing (optional)', 'note', 'One or two lines for whoever finds it next.', true)}
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
                  address: draft.address.trim(),
                  lat: located?.lat,
                  lon: located?.lon,
                  category: draft.category,
                  note: draft.note.trim(),
                  best_time: draft.bestTime.trim(),
                });
                // Rank it in the city it was added to, not the one you were browsing.
                if (draft.city !== city) setCity(draft.city);
                setNewId(created.id);
                setStep('tier');
              } catch (e: any) {
                const detail = String(e?.message ?? '');
                const match = detail.match(/\{"detail":"([^"]+)"/);
                setError(match ? match[1] : 'Could not add it — is the API running?');
              } finally {
                setBusy(false);
              }
            }}
            style={{ padding: 16, borderRadius: radius.lg, backgroundColor: ready ? colors.ink : colors.chip, alignItems: 'center' }}
          >
            <T s="med" size={15} c={ready ? '#fff' : colors.faint}>{busy ? 'Adding…' : 'Add it, then rank it'}</T>
          </Touch>
          {!ready && missing ? (
            <T s="soft" size={12.5} style={{ textAlign: 'center', paddingTop: 8, color: colors.faint }}>{missing}</T>
          ) : null}
          <Touch onPress={() => setStep('pick')} style={{ padding: 16, alignItems: 'center' }}>
            <T s="soft" size={14}>Back to search</T>
          </Touch>
        </View>
      </ScrollView>
    );
  }

  // ---------- Tier ----------
  if (step === 'tier' && newItem) {
    // Deliberately not a ScrollView: this is one decision and it should sit on
    // one screen. The note and photos come after the score, on the result step.
    // The bottom padding clears the floating tab bar.
    return (
      <View style={{ flex: 1, paddingTop: top + 8, paddingBottom: 110 }}>
        <T s="soft" size={13} style={{ paddingHorizontal: 22 }}>Ranking</T>
        <T s="serif" size={26} numberOfLines={2} style={{ paddingHorizontal: 22, paddingTop: 2, lineHeight: 29 }}>
          {newItem.title}
        </T>
        <T s="serif" size={22} style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12 }}>
          {me?.name?.split(' ')[0] ? `${me.name.split(' ')[0]}, how did it feel?` : 'How did it feel?'}
        </T>

        <View style={{ paddingHorizontal: 22, gap: 10 }}>
          {TIER_ORDER.map((t) => {
            const bg = t === 'loved' ? colors.plum : t === 'liked' ? colors.gold : colors.chip;
            const fg = t === 'loved' ? '#fff' : colors.ink;
            return (
              <Touch
                key={t}
                onPress={() => !busy && setSelectedTier(t)}
                accessibilityState={{ selected: selectedTier === t }}
                style={{
                  paddingVertical: 16,
                  paddingHorizontal: 18,
                  borderRadius: radius.xl,
                  backgroundColor: bg,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: busy ? 0.6 : 1,
                  borderWidth: 3,
                  borderColor: selectedTier === t ? colors.ink : 'transparent',
                }}
              >
                <T s="med" size={17} c={fg}>{TIERS[t].label}</T>
                <T size={13} c={fg} style={{ opacity: 0.75 }}>
                  {{ loved: 'I’d tell a friend to go', liked: 'Glad I made the time', okay: 'Not quite my thing' }[t]}
                </T>
              </Touch>
            );
          })}
        </View>

        {error ? <T s="soft" size={12} c={colors.plum} style={{ paddingHorizontal: 22, paddingTop: 12 }}>{error}</T> : null}

        <View style={{ marginTop: 'auto', paddingHorizontal: 22, gap: 4 }}>
          <Touch
            disabled={busy || !selectedTier}
            onPress={() => selectedTier && chooseTier(selectedTier)}
            style={{
              padding: 16,
              borderRadius: radius.pill,
              backgroundColor: selectedTier ? colors.ink : colors.chip,
              alignItems: 'center',
            }}
          >
            <T c={selectedTier ? '#fff' : colors.faint} s="med">
              {busy ? 'Finding its place…' : 'Find my ranking →'}
            </T>
          </Touch>
          <Touch onPress={onFinish} style={{ padding: 14, alignItems: 'center' }}>
            <T s="soft" size={14}>Cancel</T>
          </Touch>
        </View>
      </View>
    );
  }

  // ---------- Compare ----------
  if (step === 'compare' && state?.opponent && newItem) {
    const old = state.opponent;
    return (
      <View style={{ flex: 1, paddingTop: top + 8, paddingBottom: 100 }}>
        <T s="soft" size={13} style={{ paddingHorizontal: 22 }}>Comparison {state.comparison}</T>
        <T s="serif" size={30} style={{ paddingHorizontal: 22, paddingTop: 2, paddingBottom: 24 }}>Which would you do again?</T>
        <View style={{ flex: 1, paddingHorizontal: 22, gap: 12, opacity: busy ? 0.55 : 1 }}>
          <Contender photo={newItem.photo ?? newItem.photoThumb} label={newItem.title} onPress={() => !busy && compare('new')}>
            <Eyebrow style={{ color: colors.plum, fontSize: 11, marginBottom: 6 }}>This experience</Eyebrow>
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
        {error ? <View style={{ paddingHorizontal: 22 }}><T c={colors.plum} size={13}>Couldn’t finish that comparison. Try again or restart.</T><Touch onPress={() => { setStep('tier'); setError(null); }}><T c={colors.plum}>Restart ranking</T></Touch></View> : null}
        <Touch onPress={() => !busy && compare('opponent')} style={{ padding: 20, alignItems: 'center' }}>
          <T s="soft" size={14}>Keep my previous favorite ahead</T>
        </Touch>
      </View>
    );
  }

  // ---------- Done ----------
  if (step === 'done' && state) {
    const [bg, fg] = scoreColors(state.score);
    return (
      <ScrollView contentContainerStyle={{ paddingTop: top + 20, paddingBottom: 130 }}>
        <View style={{ paddingVertical: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
            <T s="serif" size={40} c={fg}>{fmtScore(state.score)}</T>
          </View>
          <T s="serif" size={30} style={{ textAlign: 'center', lineHeight: 33, marginBottom: 8 }}>{state.item?.title ?? newItem?.title}</T>
          <T s="soft" size={14}>Your #{state.rank} of {state.total} in {CITIES[state.item?.city ?? city]}</T>
        </View>
        <View style={{ paddingHorizontal: 22, gap: 10 }}>
          <T s="soft" size={13}>{connection === 'online' ? 'Your ranking is saved. Add the story and photos your friends will see.' : 'This ranking is only on this device for now. Connect to the API to save notes and photos.'}</T>
          {!uploaded ? photoEditor : <T s="soft">Photos uploaded.</T>}
          <View style={{ paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="What made this one yours? Add a note for friends…"
              multiline maxLength={2000}
              placeholderTextColor={colors.faint}
              style={{ paddingVertical: 14, fontFamily: font.body, fontSize: 14, color: colors.ink, outlineStyle: 'none' } as any}
            />
          </View>
          <Touch
            disabled={busy || connection !== 'online'}
            onPress={async () => {
              if (busy) return;
              setBusy(true); setError(null);
              try {
                const id = state.item?.id ?? newId!;
                if (picked.length && !uploaded) { await api.uploadRankingPhotos(token, id, picked); setUploaded(true); }
                await api.setNote(token, id, note.trim());
                await refresh(); onFinish();
              } catch (e: any) { setError(`Your ranking is saved, but your extras couldn't finish. Your selections are still here. ${String(e?.message ?? '')}`); }
              finally { setBusy(false); }
            }}
            style={{ padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}
          >
            <T s="med" size={15} c="#fff">{busy ? 'Saving your memories…' : 'Save note & photos'}</T>
          </Touch>
          {error ? <T c={colors.plum} size={12}>{error}</T> : null}
          <Touch disabled={busy} onPress={onFinish} style={{ padding: 12, alignItems: 'center' }}>
            <T s="soft" size={14}>Done without extras</T>
          </Touch>
        </View>
      </ScrollView>
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
