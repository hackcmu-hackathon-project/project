import React, { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { api, ItineraryResult, SaveTrip } from '../api';
import { useAuth } from '../auth';
import { colors } from '../theme';
import { SearchSources } from './SearchSources';
import { T, Touch, Row } from './ui';

export const suggestionNotes = (day: ItineraryResult['days'][number]) => [
  'Original Gemini timing suggestion; recheck after edits.',
  ...day.stops.map(s => s.schedule ? `${s.schedule.arrival}–${s.schedule.departure} ${s.item.title}: ${s.schedule.hours} ${s.schedule.caution}` : ''),
].filter(Boolean).join('\n');

/** Verification is a preview of this exact draft. Applying it never saves a trip. */
export function VerifyTrip({ trip, onApply, disabled = false }: { trip: SaveTrip; onApply: (plan: ItineraryResult) => void; disabled?: boolean }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<{ fingerprint: string; plan: ItineraryResult } | null>(null);
  const fingerprint = JSON.stringify(trip);
  const latest = useRef(fingerprint);
  latest.current = fingerprint;
  const current = proposal?.fingerprint === fingerprint ? proposal.plan : null;
  const verify = async () => {
    if (busy) return;
    setBusy(true); setError(''); setProposal(null);
    const snapshot = fingerprint;
    try {
      const plan = await api.verifyTrip(token, trip);
      if (latest.current === snapshot) setProposal({ fingerprint: snapshot, plan });
      else setError('The trip changed during verification. Verify again to check the current version.');
    } catch { setError('Could not verify this trip. Your itinerary is unchanged; try again.'); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.sunken }}>
    <Touch disabled={busy || disabled || !trip.days.some(d => d.item_ids.length)} onPress={verify} style={{ padding: 12, backgroundColor: colors.plum, borderRadius: 10 }}><T s="med" c="#fff">{busy ? 'Verifying with Gemini…' : 'Verify trip'}</T></Touch>
    <T s="soft" size={12}>Optional Gemini check for hours, closures and timing. Sends places and dates to Google only when you tap. Your trip stays unchanged until you apply suggestions.</T>
    {error ? <T accessibilityRole="alert" c={colors.plum}>{error}</T> : null}
    {current?.review ? <>
      <T s="med">{current.review.status === 'gemini' ? 'Gemini suggestions' : 'Verification unavailable'}</T>
      <T size={13}>{current.review.message}</T>
      {current.review.status === 'gemini' ? <>
        <T s="soft" size={12}>Search-informed suggestions, not confirmed availability. Times are local and transfers are estimates. Check sources before booking.</T>
        {current.days.map(day => <View key={day.date} style={{ gap: 6 }}><T s="med">{day.date}</T>
          {day.stops.map(s => <View key={s.item.id}><T size={13}>{s.schedule?.arrival}–{s.schedule?.departure} · {s.item.title}</T><T size={12}>{s.schedule?.hours}</T><T s="soft" size={12}>{s.schedule?.travel_minutes} min estimated transfer · {s.schedule?.caution}</T></View>)}
          {!day.stops.length ? <T s="soft">No stops suggested for this day.</T> : null}
        </View>)}
        {current.review.omitted?.map(o => <T key={o.item_id} c={colors.plum} size={13}>Suggested removal: {o.title} — {o.reason}</T>)}
        {current.review.sources?.map((source, i) => <Touch key={`${i}-${source.url}`} onPress={() => Linking.openURL(source.url).catch(() => setError('Could not open source.'))}><T size={12} c={colors.plum}>[{i + 1}] {source.title} ↗</T></Touch>)}
        {current.review.search_html ? <SearchSources html={current.review.search_html} /> : null}
        <Row style={{ gap: 20 }}><Touch disabled={disabled} onPress={() => { onApply(current); setProposal(null); }}><T s="med" c={colors.plum}>Apply suggestions</T></Touch><Touch onPress={() => setProposal(null)}><T>Keep my trip</T></Touch></Row>
      </> : null}
    </> : null}
  </View>;
}
