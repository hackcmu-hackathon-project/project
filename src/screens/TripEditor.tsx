import React, { useState } from 'react';
import { Linking, Modal, ScrollView, TextInput, View } from 'react-native';
import { VerifyTrip, suggestionNotes } from '../components/VerifyTrip';
import { api, ApiItem, SavedTrip } from '../api';
import { useAuth } from '../auth';
import { CITIES } from '../data';
import { useStore } from '../store';
import { colors, font } from '../theme';
import { Row, T, Touch } from '../components/ui';

const field = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: colors.surface, fontFamily: font.body, color: colors.ink };
export function TripEditor({ initial, onClose, onSaved }: { initial: SavedTrip; onClose: () => void; onSaved: (trip: SavedTrip) => void }) {
  const { token } = useAuth();
  const { items } = useStore();
  const [trip, setTrip] = useState(initial);
  const [dirty, setDirty] = useState(initial.revision === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [addDay, setAddDay] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [move, setMove] = useState<{ day: number; stop: number } | null>(null);
  const edit = (next: SavedTrip) => { setTrip(next); setDirty(true); setError(''); };
  const changeStops = (day: number, from: number, to?: number) => {
    const days = trip.days.map(d => ({ ...d, stops: [...d.stops] }));
    const [stop] = days[day].stops.splice(from, 1);
    if (to !== undefined) days[day].stops.splice(to, 0, stop);
    edit({ ...trip, days }); setMove(null);
  };
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const saved = await api.saveTrip(token, trip.id, {
        title: trip.title, city: trip.city, travel_mode: trip.travel_mode, revision: trip.revision,
        days: trip.days.map(d => ({ date: d.date, item_ids: d.stops.map(s => s.item.id), notes: d.notes ?? '' })),
      });
      setTrip(saved); setDirty(false); onSaved(saved);
      if (closing) onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(message.startsWith('409') ? 'This trip changed elsewhere. Your edits are still here; reopen the saved trip before updating it.' : message.startsWith('422') ? 'Check the trip name, dates and places. A place may no longer be available.' : 'Could not save. Your edits are still here—check your connection and retry.');
    } finally { setBusy(false); }
  };
  const openRoute = (places: ApiItem[]) => {
    if (!places.length) return;
    const names = places.map(i => `${i.title}, ${i.hood}, ${CITIES[trip.city]}`);
    const params: Record<string, string> = { api: '1', destination: names[names.length - 1], travelmode: trip.travel_mode };
    if (names.length > 1) params.origin = names[0];
    if (names.length > 2) params.waypoints = names.slice(1, -1).join('|');
    Linking.openURL('https://www.google.com/maps/dir/?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')).catch(() => setError('Could not open Google Maps.'));
  };
  const used = new Set(trip.days.flatMap(d => d.stops.map(s => s.item.id)));
  const choices = items.filter(i => i.city === trip.city && !used.has(i.id) && `${i.title} ${i.hood}`.toLowerCase().includes(query.toLowerCase()));
  const button = (label: string, action: () => void, disabled = false) => <Touch disabled={busy || disabled} onPress={action} style={{ paddingVertical: 10, paddingHorizontal: 8 }}><T size={13} c={colors.plum}>{label}</T></Touch>;
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) { dirty ? setClosing(true) : onClose(); } }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 64, paddingHorizontal: 22, paddingBottom: 60, gap: 16 }} style={{ backgroundColor: colors.bg }}>
      <Row style={{ justifyContent: 'space-between' }}>{button('← Back', () => dirty ? setClosing(true) : onClose())}{button(busy ? 'Saving…' : 'Save itinerary', save, !dirty || !trip.title.trim())}</Row>
      {closing ? <View style={{ padding: 14, backgroundColor: colors.sunken, borderRadius: 12 }}><T>Save your changes before leaving?</T><Row>{button('Save & close', save, !trip.title.trim())}{button('Discard edits', onClose)}{button('Keep editing', () => setClosing(false))}</Row></View> : null}
      <T s="serif" size={32}>Make it your trip.</T>
      <TextInput accessibilityLabel="Trip name" maxLength={120} value={trip.title} editable={!busy} onChangeText={title => edit({ ...trip, title })} style={field} />
      <T s="soft" size={13}>{CITIES[trip.city]} · {dirty ? 'Unsaved changes' : 'Saved to your account'}</T>
      <Row>{(['walking', 'driving', 'bicycling'] as const).map(mode => <React.Fragment key={mode}>{button(`${trip.travel_mode === mode ? '✓ ' : ''}${mode}`, () => edit({ ...trip, travel_mode: mode }))}</React.Fragment>)}</Row>
      {error ? <T accessibilityRole="alert" c={colors.plum}>{error}</T> : null}
      <VerifyTrip disabled={busy} trip={{ title: trip.title.trim() || 'My trip', city: trip.city, travel_mode: trip.travel_mode, revision: trip.revision, days: trip.days.map(d => ({ date: d.date, item_ids: d.stops.map(s => s.item.id), notes: d.notes ?? '' })) }}
        onApply={checked => { edit({ ...trip, days: checked.days.map(d => ({ ...d, notes: [trip.days.find(old => old.date === d.date)?.notes, suggestionNotes(d)].filter(Boolean).join('\n').slice(0, 2000) })) }); setMove(null); setAddDay(null); }} />
      <T s="soft" size={12}>Up to five stops per day. Routes follow your edited order. Check opening hours and allow time for travel.</T>
      {trip.days.map((day, n) => <View key={day.date} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10 }}>
        <T s="serif" size={26}>Day {n + 1} · {day.date}</T>
        <T s="soft" size={12}>{day.stops.reduce((sum, s) => sum + Math.max(0, s.item.duration_min), 0)} min of activities</T>
        {day.stops.map((s, index) => <View key={s.item.id} style={{ borderLeftWidth: 2, borderLeftColor: colors.plumSoft, paddingLeft: 10 }}>
          <T s="med">{index + 1}. {s.item.title}</T><T s="soft" size={12}>{s.item.hood}</T>
          <Row style={{ flexWrap: 'wrap' }}>{button('↑ Up', () => changeStops(n, index, index - 1), index === 0)}{button('↓ Down', () => changeStops(n, index, index + 1), index === day.stops.length - 1)}{button('Move day', () => setMove({ day: n, stop: index }), trip.days.length < 2)}{button('Remove', () => changeStops(n, index))}</Row>
          {move?.day === n && move.stop === index ? <Row style={{ flexWrap: 'wrap' }}>{trip.days.map((target, dest) => dest !== n ? <React.Fragment key={target.date}>{button(`Day ${dest + 1}`, () => {
            const days = trip.days.map(d => ({ ...d, stops: [...d.stops] }));
            const [stop] = days[n].stops.splice(index, 1); days[dest].stops.push(stop);
            edit({ ...trip, days }); setMove(null);
          }, target.stops.length >= 5)}</React.Fragment> : null)}{button('Cancel', () => setMove(null))}</Row> : null}
        </View>)}
        {button('+ Add a place', () => { setAddDay(n); setQuery(''); }, day.stops.length >= 5)}
        {addDay === n ? <View style={{ gap: 8 }}>
          <TextInput accessibilityLabel={`Search places for day ${n + 1}`} value={query} onChangeText={setQuery} placeholder="Search this city…" style={field} />
          {choices.slice(0, 15).map(i => <React.Fragment key={i.id}>{button(`＋ ${i.title}`, () => {
            // Catalogue items use camelCase; preserve the API shape used by saved trips.
            const item: ApiItem = { id: i.id, city: i.city, title: i.title, hood: i.hood, category: i.category, duration_min: i.durationMin, price: i.price, best_time: i.bestTime, note: i.note, tip: i.tip, tags: i.tags, img: i.img, photo_url: i.photo, photo_thumb: i.photoThumb, photo_credit: i.photoCredit, photo_license: i.photoLicense, photo_source_url: i.photoSource };
            edit({ ...trip, days: trip.days.map((d, k) => k === n ? { ...d, stops: [...d.stops, { item, reasons: ['Added by you'] }] } : d) }); setAddDay(null);
          })}</React.Fragment>)}
          {!choices.length ? <T s="soft">No matching unused places.</T> : null}
          {choices.length > 15 ? <T s="soft" size={12}>Search to narrow these results.</T> : null}
          {button('Cancel', () => setAddDay(null))}
        </View> : null}
        <TextInput accessibilityLabel={`Day ${n + 1} notes`} placeholder="Notes, times, reservations…" multiline maxLength={2000} editable={!busy} value={day.notes ?? ''} style={field} onChangeText={notes => edit({ ...trip, days: trip.days.map((d, k) => k === n ? { ...d, notes } : d) })} />
        {button('Open route in Google Maps ↗', () => openRoute(day.stops.map(s => s.item)), !day.stops.length)}
      </View>)}
    </ScrollView>
  </Modal>;
}
