import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { api, ItineraryRequest, SavedTrip } from '../api';
import { useAuth } from '../auth';
import { CITIES } from '../data';
import { useStore } from '../store';
import { colors, font, radius } from '../theme';
import { CityChips, Eyebrow, Row, T, Touch } from '../components/ui';

const field = {
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.md,
  paddingHorizontal: 14,
  paddingVertical: 12,
  backgroundColor: colors.surface,
  fontFamily: font.body,
  fontSize: 15,
  color: colors.ink,
  outlineStyle: 'none',
} as any;

const today = () => new Date().toISOString().slice(0, 10);
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const pretty = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Planning page: the trips you've saved, and the form that makes a new one. */
export function Trips({
  top,
  onClose,
  onOpen,
}: {
  top: number;
  onClose: () => void;
  onOpen: (trip: SavedTrip) => void;
}) {
  const { token } = useAuth();
  const { city, setCity, items, saves, connection } = useStore();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [pace, setPace] = useState(3);
  const [mode, setMode] = useState<ItineraryRequest['travel_mode']>('walking');
  const [must, setMust] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.trips(token).then(setTrips).catch(() => setTrips([]));
  }, [token]);
  useEffect(load, [load]);

  const options = items.filter(
    (i) =>
      i.city === city &&
      (query.trim()
        ? `${i.title} ${i.hood}`.toLowerCase().includes(query.trim().toLowerCase())
        : saves.some((s) => s.id === i.id) || must.includes(i.id))
  );

  const build = async () => {
    if (busy) return;
    const span = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (!validDate(start) || !validDate(end) || span < 0 || span >= 14) {
      setError('Pick an end date on or after the start, within two weeks.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const plan = await api.itinerary(token, {
        city,
        start_date: start,
        end_date: end,
        stops_per_day: pace,
        travel_mode: mode,
        must_try_ids: must,
      });
      // A fresh plan is an unsaved trip; the trip screen is where it gets edited and kept.
      onOpen({
        id: Crypto.randomUUID(),
        title: `${CITIES[city]} trip`,
        city,
        travel_mode: mode,
        revision: 0,
        updated_at: '',
        days: plan.days.map((d) => ({ ...d, notes: '' })),
      });
    } catch {
      setError('Could not build that. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 130 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Touch onPress={onClose} style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
        <T s="soft" size={14}>← Lists</T>
      </Touch>
      <T s="serif" size={36} style={{ paddingHorizontal: 22 }}>Trips</T>

      {trips.length ? (
        <>
          <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 }}>Saved</Eyebrow>
          <View style={{ paddingHorizontal: 22, gap: 10 }}>
            {trips.map((t) => (
              <Touch
                key={t.id}
                onPress={() => onOpen(t)}
                style={{
                  padding: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View style={{ flex: 1 }}>
                  <T s="med" size={15}>{t.title}</T>
                  <T s="soft" size={12.5} style={{ marginTop: 3 }}>
                    {CITIES[t.city]} · {pretty(t.days[0].date)}
                    {t.days.length > 1 ? ` – ${pretty(t.days[t.days.length - 1].date)}` : ''} ·{' '}
                    {t.days.reduce((n, d) => n + d.stops.length, 0)} stops
                  </T>
                </View>
                <T c={colors.faint} size={16}>›</T>
              </Touch>
            ))}
          </View>
        </>
      ) : null}

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 12 }}>New trip</Eyebrow>
      <View style={{ paddingHorizontal: 22, gap: 16 }}>
        <CityChips city={city} onChange={(c) => { setCity(c); setMust([]); setQuery(''); }} />

        <Row style={{ gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ fontSize: 11, marginBottom: 6 }}>From</Eyebrow>
            <TextInput value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" placeholderTextColor={colors.faint} autoCapitalize="none" style={field} />
          </View>
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ fontSize: 11, marginBottom: 6 }}>To</Eyebrow>
            <TextInput value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" placeholderTextColor={colors.faint} autoCapitalize="none" style={field} />
          </View>
        </Row>

        <View>
          <Eyebrow style={{ fontSize: 11, marginBottom: 8 }}>Stops per day</Eyebrow>
          <Row style={{ gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Touch
                key={n}
                onPress={() => setPace(n)}
                label={`${n} stops per day`}
                style={{
                  width: 44,
                  paddingVertical: 10,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  backgroundColor: pace === n ? colors.ink : colors.surface,
                  borderWidth: 1,
                  borderColor: pace === n ? colors.ink : colors.border,
                }}
              >
                <T s="med" size={13} c={pace === n ? '#fff' : colors.ink}>{n}</T>
              </Touch>
            ))}
          </Row>
        </View>

        <View>
          <Eyebrow style={{ fontSize: 11, marginBottom: 8 }}>Getting around</Eyebrow>
          <Row style={{ gap: 8 }}>
            {([['walking', 'Walk'], ['driving', 'Drive'], ['bicycling', 'Bike']] as const).map(([value, label]) => (
              <Touch
                key={value}
                onPress={() => setMode(value)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: radius.pill,
                  backgroundColor: mode === value ? colors.ink : colors.surface,
                  borderWidth: 1,
                  borderColor: mode === value ? colors.ink : colors.border,
                }}
              >
                <T s="med" size={13} c={mode === value ? '#fff' : colors.ink}>{label}</T>
              </Touch>
            ))}
          </Row>
        </View>

        <View>
          <Eyebrow style={{ fontSize: 11, marginBottom: 8 }}>
            Must include{must.length ? ` · ${must.length}` : ''}
          </Eyebrow>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search places"
            placeholderTextColor={colors.faint}
            style={field}
          />
          {options.slice(0, 12).map((i) => (
            <Touch
              key={i.id}
              onPress={() => setMust((prev) => (prev.includes(i.id) ? prev.filter((id) => id !== i.id) : [...prev, i.id]))}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.hair }}
            >
              <View style={{ flex: 1 }}>
                <T s="med" size={14} c={must.includes(i.id) ? colors.plum : colors.ink}>{i.title}</T>
                <T s="soft" size={12} style={{ marginTop: 2 }}>{i.hood}</T>
              </View>
              <T size={15} c={must.includes(i.id) ? colors.plum : colors.faint}>{must.includes(i.id) ? '✓' : '＋'}</T>
            </Touch>
          ))}
          {!options.length ? (
            <T s="soft" size={13} style={{ paddingTop: 10 }}>
              {query ? 'Nothing matches.' : 'Save places you want to go and they show up here.'}
            </T>
          ) : null}
        </View>

        {error ? <T size={13} c={colors.plum}>{error}</T> : null}

        <Touch
          onPress={build}
          disabled={busy || connection !== 'online'}
          style={{ padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}
        >
          <T s="med" size={15} c="#fff">{busy ? 'Building…' : 'Build itinerary'}</T>
        </Touch>
      </View>
    </ScrollView>
  );
}
