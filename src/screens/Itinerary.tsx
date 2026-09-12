import React, { useRef, useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { api, ItineraryRequest, ItineraryResult } from '../api';
import { useAuth } from '../auth';
import { CityChips, Eyebrow, Row, T, Touch } from '../components/ui';
import { useStore } from '../store';
import { colors, font } from '../theme';

const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontFamily: font.body, color: colors.ink, backgroundColor: colors.surface };
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export function Itinerary({ top, onClose }: { top: number; onClose: () => void }) {
  const { token } = useAuth();
  const { city, setCity, items, saves, connection } = useStore();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [pace, setPace] = useState(3);
  const [mode, setMode] = useState<ItineraryRequest['travel_mode']>('walking');
  const [must, setMust] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const invalidate = () => { request.current++; setBusy(false); setResult(null); setError(''); };
  const options = items.filter(i => i.city === city && (query.trim() ? `${i.title} ${i.hood}`.toLowerCase().includes(query.trim().toLowerCase()) : saves.some(s => s.id === i.id) || must.includes(i.id)));
  const generate = async () => {
    if (busy) return;
    setError('');
    const span = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (!validDate(start) || !validDate(end) || span < 0 || span >= 14) {
      setError('Enter valid dates as YYYY-MM-DD, with an end date within 14 days of your start.'); return;
    }
    const version = ++request.current;
    setBusy(true); setResult(null);
    try {
      const plan = await api.itinerary(token, { city, start_date: start, end_date: end, stops_per_day: pace, travel_mode: mode, must_try_ids: must });
      if (version === request.current) setResult(plan);
    } catch {
      if (version === request.current) setError('Could not build your trip. Check your connection and try again.');
    } finally {
      if (version === request.current) setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={{ paddingTop: top, paddingHorizontal: 22, paddingBottom: 130, gap: 18 }} keyboardShouldPersistTaps="handled">
      <Touch onPress={onClose}><T c={colors.plum}>← My lists</T></Touch>
      <View><T s="serif" size={36}>A trip that feels like you.</T><T s="soft" size={14} style={{ marginTop: 8 }}>Must-tries first, then your saves and recommendations from people you follow.</T></View>
      <CityChips city={city} onChange={c => { invalidate(); setCity(c); setMust([]); setQuery(''); }} />
      <Row style={{ gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}><Eyebrow>Start date</Eyebrow><TextInput accessibilityLabel="Start date YYYY-MM-DD" placeholder="YYYY-MM-DD" value={start} onChangeText={v => { invalidate(); setStart(v); }} style={inputStyle} autoCapitalize="none" /></View>
        <View style={{ flex: 1, gap: 6 }}><Eyebrow>End date</Eyebrow><TextInput accessibilityLabel="End date YYYY-MM-DD" placeholder="YYYY-MM-DD" value={end} onChangeText={v => { invalidate(); setEnd(v); }} style={inputStyle} autoCapitalize="none" /></View>
      </Row>
      <Eyebrow>Stops per day</Eyebrow>
      <Row style={{ gap: 10 }}>{[1, 2, 3, 4, 5].map(n => <Touch key={n} label={`${n} stops per day`} onPress={() => { invalidate(); setPace(n); }} style={{ padding: 12, borderRadius: 12, backgroundColor: pace === n ? colors.plum : colors.surface }}><T c={pace === n ? '#fff' : colors.ink}>{n}</T></Touch>)}</Row>
      <Row style={{ gap: 8 }}>{(['walking', 'driving', 'bicycling'] as const).map(m => <Touch key={m} onPress={() => { invalidate(); setMode(m); }} style={{ padding: 10, borderRadius: 12, backgroundColor: mode === m ? colors.ink : colors.surface }}><T size={13} c={mode === m ? '#fff' : colors.ink}>{m === 'walking' ? 'Walk' : m === 'driving' ? 'Drive' : 'Bike'}</T></Touch>)}</Row>
      <View style={{ gap: 10 }}>
        <Eyebrow>Must-tries · {must.length} selected</Eyebrow>
        <TextInput accessibilityLabel="Search must-try places" placeholder="Search places to include…" value={query} onChangeText={setQuery} style={inputStyle} />
        <T s="soft" size={12}>Your saved places are included automatically. Select the ones you most want to try, or search the catalogue.</T>
        {options.slice(0, 30).map(i => <Touch key={i.id} onPress={() => { invalidate(); setMust(prev => prev.includes(i.id) ? prev.filter(id => id !== i.id) : [...prev, i.id]); }} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}><T size={14} c={must.includes(i.id) ? colors.plum : colors.ink}>{must.includes(i.id) ? '✓' : '＋'} {i.title}</T><T s="soft" size={12}>{i.hood}</T></Touch>)}
        {options.length > 30 ? <T s="soft" size={12}>Showing 30 matches. Refine your search to find more.</T> : null}
      </View>
      {connection !== 'online' ? <T s="soft">Connect to the API to use your saves and friends’ recommendations.</T> : null}
      <Touch onPress={generate} disabled={busy || connection !== 'online'} style={{ padding: 16, backgroundColor: colors.plum, borderRadius: 14, alignItems: 'center' }}><T s="med" c="#fff">{busy ? 'Planning your days…' : 'Build my itinerary'}</T></Touch>
      {error ? <T accessibilityRole="alert" c={colors.plum}>{error}</T> : null}
      {result ? <>
        <T s="soft" size={13}>Stops are grouped by neighborhood. Activity durations exclude travel. Check opening hours, reservations and the matched places in Maps before you go.</T>
        {result.unscheduled_count > 0 ? <T c={colors.plum}>{result.unscheduled_count} picks didn’t fit{result.unscheduled_must_try_ids.length ? `, including ${result.unscheduled_must_try_ids.length} must-tries` : ''}. Add days or increase stops per day.</T> : null}
        {result.days.map((day, n) => <View key={day.date} style={{ padding: 18, backgroundColor: colors.surface, borderRadius: 18, gap: 12 }}>
          <T s="serif" size={26}>Day {n + 1} · {day.date.slice(5)}</T>
          <T s="soft" size={12}>{day.activity_minutes} min of activities</T>
          {day.stops.map((stop, index) => <View key={stop.item.id} style={{ borderLeftWidth: 2, borderLeftColor: colors.plumSoft, paddingLeft: 12, gap: 4 }}>
            <T s="med">{index + 1}. {stop.item.title}</T>
            <T s="soft" size={12}>{stop.item.hood} · {stop.item.duration_min} min</T>
            <T c={colors.plum} size={12}>{stop.reasons.join(' · ')}</T>
            {stop.item.best_time ? <T s="soft" size={12}>Suggested time: {stop.item.best_time}</T> : null}
          </View>)}
          {!day.stops.length ? <T s="soft">No more picks. Save more places or select must-tries to fill this day.</T> : null}
          {day.maps_url ? <Touch onPress={() => Linking.openURL(day.maps_url!).catch(() => setError('Could not open Google Maps. Please try again.'))}><T s="med" c={colors.plum}>Open day’s route in Google Maps ↗</T></Touch> : null}
        </View>)}
      </> : null}
    </ScrollView>
  );
}
