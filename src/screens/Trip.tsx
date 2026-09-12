import React, { useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { ApiItem, SavedTrip, api } from '../api';
import { useAuth } from '../auth';
import { CITIES, Item } from '../data';
import { suggestStops } from '../stopSuggestions';
import { useStore } from '../store';
import { colors, font, radius } from '../theme';
import { Photo, Row, T, Touch } from '../components/ui';

const field = {
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.md,
  paddingHorizontal: 14,
  paddingVertical: 12,
  backgroundColor: colors.surface,
  fontFamily: font.body,
  fontSize: 14,
  color: colors.ink,
  outlineStyle: 'none',
} as any;

const pretty = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** One itinerary: the days, in order, and everything you can do to them. */
export function Trip({
  initial,
  top,
  from,
  onClose,
  onSaved,
}: {
  initial: SavedTrip;
  top: number;
  from?: 'trips' | 'agent';
  onClose: () => void;
  onSaved: (trip: SavedTrip) => void;
}) {
  const { token } = useAuth();
  const { items, saves } = useStore();
  const [trip, setTrip] = useState(initial);
  const [dirty, setDirty] = useState(initial.revision === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addTo, setAddTo] = useState<number | null>(null);
  const [moving, setMoving] = useState<{ day: number; stop: number } | null>(null);
  const [query, setQuery] = useState('');
  const [suggestFor, setSuggestFor] = useState<{ day: number; anchorId?: number } | null>(null);
  const [category, setCategory] = useState('Any');
  const [maxPrice, setMaxPrice] = useState(3);

  const addSuggestion = (item: Item, reason: string) => {
    if (!suggestFor || busy) return;
    if (trip.days[suggestFor.day].stops.length >= 5 || trip.days.some(d => d.stops.some(s => s.item.id === item.id))) return;
    const apiItem: ApiItem = {
      id: item.id, city: item.city, title: item.title, hood: item.hood, category: item.category,
      duration_min: item.durationMin, price: item.price, best_time: item.bestTime,
      note: item.note, tip: item.tip, tags: item.tags, img: item.img,
      photo_url: item.photo, photo_thumb: item.photoThumb, photo_credit: item.photoCredit,
      photo_license: item.photoLicense, photo_source_url: item.photoSource,
    };
    const days = trip.days.map((d, n) => {
      if (n !== suggestFor.day) return d;
      const stops = [...d.stops];
      const anchorIndex = stops.findIndex(s => s.item.id === suggestFor.anchorId);
      stops.splice(anchorIndex >= 0 ? anchorIndex + 1 : stops.length, 0, { item: apiItem, reasons: [reason] });
      return { ...d, stops, activity_minutes: stops.reduce((total, stop) => total + Math.max(0, stop.item.duration_min), 0), maps_url: null };
    });
    edit({ ...trip, days });
    setSuggestFor(null);
  };


  const edit = (next: SavedTrip) => { setTrip(next); setDirty(true); setError(''); };

  const reorder = (day: number, from: number, to?: number) => {
    const days = trip.days.map((d) => ({ ...d, stops: [...d.stops] }));
    const [stop] = days[day].stops.splice(from, 1);
    if (to !== undefined) days[day].stops.splice(to, 0, stop);
    edit({ ...trip, days });
    setMoving(null);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.saveTrip(token, trip.id, {
        title: trip.title.trim() || 'My trip',
        city: trip.city,
        travel_mode: trip.travel_mode,
        revision: trip.revision,
        days: trip.days.map((d) => ({ date: d.date, item_ids: d.stops.map((s) => s.item.id), notes: d.notes ?? '' })),
      });
      setTrip(saved);
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.startsWith('409')
          ? 'This trip changed somewhere else. Reopen it before saving.'
          : 'Could not save. Your edits are still here.'
      );
    } finally {
      setBusy(false);
    }
  };

  const openRoute = (places: ApiItem[]) => {
    if (!places.length) return;
    const names = places.map((i) => `${i.title}, ${i.hood}, ${CITIES[trip.city]}`);
    const params: Record<string, string> = {
      api: '1',
      destination: names[names.length - 1],
      travelmode: trip.travel_mode,
    };
    if (names.length > 1) params.origin = names[0];
    if (names.length > 2) params.waypoints = names.slice(1, -1).join('|');
    Linking.openURL(
      'https://www.google.com/maps/dir/?' +
        Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    ).catch(() => setError('Could not open Google Maps.'));
  };

  const used = new Set(trip.days.flatMap((d) => d.stops.map((s) => s.item.id)));
  const choices = items.filter(
    (i) => i.city === trip.city && !used.has(i.id) && `${i.title} ${i.hood}`.toLowerCase().includes(query.toLowerCase())
  );

  const anchor = suggestFor ? trip.days[suggestFor.day]?.stops.find(s => s.item.id === suggestFor.anchorId)?.item : undefined;
  const suggestions = suggestFor ? suggestStops({ items, city: trip.city, used, anchor,
    saved: new Set(saves.map(i => i.id)), category, maxPrice }) : [];
  const categories = ['Any', ...Array.from(new Set(items.filter(i => i.city === trip.city).map(i => i.category))).sort()];
  const openSuggestions = (day: number, anchorId?: number) => {
    setSuggestFor({ day, anchorId }); setAddTo(null); setCategory('Any'); setMaxPrice(3);
  };

  const action = (label: string, onPress: () => void, disabled = false) => (
    <Touch key={label} onPress={onPress} disabled={busy || disabled} style={{ paddingVertical: 6, paddingRight: 14 }}>
      <T size={12.5} c={disabled ? colors.faint : colors.plum}>{label}</T>
    </Touch>
  );

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 130 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Row style={{ paddingHorizontal: 22, justifyContent: 'space-between', alignItems: 'center' }}>
        <Touch onPress={onClose}><T s="soft" size={14}>← {from === 'agent' ? 'Ask' : 'Trips'}</T></Touch>
        {dirty ? (
          <Touch onPress={save} disabled={busy} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.ink }}>
            <T s="med" size={13} c="#fff">{busy ? 'Saving…' : 'Save'}</T>
          </Touch>
        ) : (
          <T s="soft" size={12.5} c={colors.faint}>Saved</T>
        )}
      </Row>

      <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
        <TextInput
          value={trip.title}
          onChangeText={(title) => edit({ ...trip, title })}
          maxLength={120}
          placeholder="Name this trip"
          placeholderTextColor={colors.faint}
          style={{ fontFamily: font.serif, fontSize: 32, color: colors.ink, outlineStyle: 'none' } as any}
        />
        <T s="soft" size={13} style={{ marginTop: 2 }}>
          {CITIES[trip.city]} · {trip.days.length} day{trip.days.length > 1 ? 's' : ''} ·{' '}
          {trip.days.reduce((n, d) => n + d.stops.length, 0)} stops
        </T>
      </View>

      <Row style={{ gap: 8, paddingHorizontal: 22, paddingTop: 16 }}>
        {([['walking', 'Walk'], ['driving', 'Drive'], ['bicycling', 'Bike']] as const).map(([value, label]) => (
          <Touch
            key={value}
            onPress={() => edit({ ...trip, travel_mode: value })}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: trip.travel_mode === value ? colors.ink : colors.surface,
              borderWidth: 1,
              borderColor: trip.travel_mode === value ? colors.ink : colors.border,
            }}
          >
            <T s="med" size={12.5} c={trip.travel_mode === value ? '#fff' : colors.ink}>{label}</T>
          </Touch>
        ))}
      </Row>

      {error ? <T size={13} c={colors.plum} style={{ paddingHorizontal: 22, paddingTop: 14 }}>{error}</T> : null}

      <View style={{ paddingHorizontal: 22, paddingTop: 20, gap: 14 }}>
        {trip.days.map((day, n) => (
          <View key={day.date} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <T s="serif" size={22}>Day {n + 1}</T>
              <T s="soft" size={12.5}>{pretty(day.date)}</T>
            </Row>

            {day.stops.map((s, index) => (
              <View key={s.item.id} style={{ paddingTop: 14 }}>
                <Row style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Photo uri={s.item.photo_thumb ?? s.item.photo_url} label={s.item.title} radius={10} style={{ width: 46, height: 46 }} />
                  <View style={{ flex: 1 }}>
                    <T s="med" size={14.5}>{index + 1}. {s.item.title}</T>
                    <T s="soft" size={12} style={{ marginTop: 2 }}>
                      {s.item.hood} · {s.item.duration_min} min
                    </T>
                    <Row style={{ flexWrap: 'wrap', marginTop: 4 }}>
                      {action('Up', () => reorder(n, index, index - 1), index === 0)}
                      {action('Down', () => reorder(n, index, index + 1), index === day.stops.length - 1)}
                      {action('Move', () => setMoving({ day: n, stop: index }), trip.days.length < 2)}
                      {action('Remove', () => reorder(n, index))}
                      {action('Suggest next stop', () => openSuggestions(n, s.item.id), day.stops.length >= 5)}
                    </Row>
                  </View>
                </Row>

                {moving?.day === n && moving.stop === index ? (
                  <Row style={{ flexWrap: 'wrap', paddingLeft: 58 }}>
                    {trip.days.map((target, dest) =>
                      dest === n ? null : (
                        action(`→ Day ${dest + 1}`, () => {
                          const days = trip.days.map((d) => ({ ...d, stops: [...d.stops] }));
                          const [stop] = days[n].stops.splice(index, 1);
                          days[dest].stops.push(stop);
                          edit({ ...trip, days });
                          setMoving(null);
                        }, target.stops.length >= 5)
                      )
                    )}
                    {action('Cancel', () => setMoving(null))}
                  </Row>
                ) : null}
              </View>
            ))}

            {!day.stops.length ? (
              <T s="soft" size={13} style={{ paddingTop: 12 }}>Nothing here yet.</T>
            ) : null}

            <View style={{ paddingTop: 12 }}>
              {addTo === n ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={`Search ${CITIES[trip.city]}`}
                    placeholderTextColor={colors.faint}
                    style={field}
                  />
                  {choices.slice(0, 8).map((i) => (
                    <Touch
                      key={i.id}
                      onPress={() => {
                        // Saved trips speak the API's shape; the catalogue is camelCase.
                        const item: ApiItem = {
                          id: i.id, city: i.city, title: i.title, hood: i.hood, category: i.category,
                          duration_min: i.durationMin, price: i.price, best_time: i.bestTime, note: i.note,
                          tip: i.tip, tags: i.tags, img: i.img, photo_url: i.photo, photo_thumb: i.photoThumb,
                          photo_credit: i.photoCredit, photo_license: i.photoLicense, photo_source_url: i.photoSource,
                        };
                        edit({
                          ...trip,
                          days: trip.days.map((d, k) =>
                            k === n ? { ...d, stops: [...d.stops, { item, reasons: ['Added by you'] }] } : d
                          ),
                        });
                        setAddTo(null);
                        setQuery('');
                      }}
                      style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.hair }}
                    >
                      <T size={14}>{i.title}</T>
                      <T s="soft" size={12} style={{ marginTop: 2 }}>{i.hood}</T>
                    </Touch>
                  ))}
                  {!choices.length ? <T s="soft" size={13}>Nothing left that matches.</T> : null}
                  {action('Cancel', () => { setAddTo(null); setQuery(''); })}
                </View>
              ) : (
                <Row style={{ flexWrap: 'wrap' }}>
                  {action('＋ Add a place', () => { setAddTo(n); setSuggestFor(null); setQuery(''); }, day.stops.length >= 5)}
                  {action('✧ Suggest a stop', () => openSuggestions(n, day.stops[day.stops.length - 1]?.item.id), day.stops.length >= 5)}
                  {day.stops.length ? action('Route in Maps ↗', () => openRoute(day.stops.map((s) => s.item))) : null}
                </Row>
              )}
            </View>

            {suggestFor?.day === n ? (
              <View style={{ marginTop: 14, padding: 14, gap: 10, borderRadius: radius.md, backgroundColor: colors.sunken }}>
                <T s="serif" size={23}>A little more to your day</T>
                <T s="soft" size={12.5}>
                  {anchor ? `Suggestions after ${anchor.title}. Same-neighborhood places come first; distances and opening hours aren't checked.` : 'Discover another place in your trip’s city.'}
                </T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Row style={{ gap: 6 }}>
                    {categories.map(c => (
                      <Touch key={c} onPress={() => setCategory(c)} accessibilityRole="button" accessibilityState={{ selected: category === c }}
                        style={{ padding: 9, borderRadius: radius.pill, backgroundColor: category === c ? colors.ink : colors.surface }}>
                        <T size={12} c={category === c ? '#fff' : colors.ink}>{c}</T>
                      </Touch>
                    ))}
                  </Row>
                </ScrollView>
                <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                  {['Free', 'Up to $', 'Up to $$', 'Any price'].map((label, price) => (
                    <Touch key={label} onPress={() => setMaxPrice(price)} accessibilityRole="button" accessibilityState={{ selected: maxPrice === price }}
                      style={{ padding: 8, borderRadius: radius.pill, backgroundColor: maxPrice === price ? colors.ink : colors.surface }}>
                      <T size={12} c={maxPrice === price ? '#fff' : colors.ink}>{label}</T>
                    </Touch>
                  ))}
                </Row>
                {suggestions.map(({ item, reason }) => (
                  <View key={item.id} style={{ padding: 12, borderRadius: radius.md, backgroundColor: colors.surface }}>
                    <Row style={{ gap: 10, alignItems: 'flex-start' }}>
                      <Photo uri={item.photoThumb ?? item.photo} label={item.title} radius={8} style={{ width: 50, height: 50 }} />
                      <View style={{ flex: 1 }}>
                        <T s="med" size={14}>{item.title}</T>
                        <T s="soft" size={12}>{item.hood} · {item.durationMin} min · {item.price === 0 ? 'Free' : '$'.repeat(item.price)}</T>
                      </View>
                    </Row>
                    <T s="soft" size={12} style={{ marginTop: 8 }}>{reason}</T>
                    {action('＋ Add to this day', () => addSuggestion(item, reason), day.stops.length >= 5)}
                  </View>
                ))}
                {!suggestions.length ? <T s="soft" size={13}>No matches left. Try another category or price range.</T> : null}
                {action('Close suggestions', () => setSuggestFor(null))}
              </View>
            ) : null}

            <TextInput
              value={day.notes ?? ''}
              onChangeText={(notes) => edit({ ...trip, days: trip.days.map((d, k) => (k === n ? { ...d, notes } : d)) })}
              placeholder="Notes, times, reservations…"
              placeholderTextColor={colors.faint}
              multiline
              maxLength={2000}
              style={[field, { marginTop: 12, minHeight: 44 }]}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
