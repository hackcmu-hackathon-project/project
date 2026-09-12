import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { AgentReply, AgentTurn, SavedTrip, api, toItem } from '../api';
import { useAuth } from '../auth';
import { CITIES, meta } from '../data';
import { useStore } from '../store';
import { colors, font, radius } from '../theme';
import { CityChips, Photo, Row, T, Touch } from '../components/ui';

type Entry = AgentTurn & { places?: AgentReply['places']; trip?: SavedTrip | null };

const OPENERS = [
  'Something outside this afternoon',
  'What have my friends loved lately?',
  'Plan a weekend from my saved places',
  'Somewhere quiet on a rainy day',
];

/** Ask for things to do in plain language; the assistant works off your own data. */
export function Agent({
  top,
  onOpenItem,
  onOpenTrip,
}: {
  top: number;
  onOpenItem: (id: number) => void;
  onOpenTrip: (trip: SavedTrip) => void;
}) {
  const { token } = useAuth();
  const { city, setCity, connection, refresh } = useStore();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history: AgentTurn[] = [...entries.map((e) => ({ role: e.role, text: e.text })), { role: 'user', text: question }];
    setEntries((prev) => [...prev, { role: 'user', text: question }]);
    setDraft('');
    setBusy(true);
    try {
      const answer = await api.agent(token, history, city);
      setEntries((prev) => [...prev, { role: 'model', text: answer.reply, places: answer.places, trip: answer.trip }]);
      // Saving a place or building a trip changes lists the rest of the app shows.
      if (answer.trip || answer.saved_ids?.length) refresh();
    } catch {
      setEntries((prev) => [...prev, { role: 'model', text: 'Could not reach the assistant. Check your connection and try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Row style={{ paddingHorizontal: 22, paddingTop: top + 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <T s="serif" size={36}>Ask</T>
        {entries.length ? (
          <Touch onPress={() => setEntries([])}><T s="soft" size={13}>Clear</T></Touch>
        ) : null}
      </Row>
      <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 4 }}>
        <CityChips city={city} onChange={setCity} />
      </View>

      <ScrollView
        ref={scroller}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 22, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!entries.length ? (
          <View style={{ gap: 10 }}>
            <T s="soft" size={14} style={{ lineHeight: 21 }}>
              I know the {CITIES[city]} catalogue, what you've ranked and saved, and what the people you
              follow rate highly. I can also build you a trip.
            </T>
            {OPENERS.map((o) => (
              <Touch
                key={o}
                onPress={() => ask(o)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <T size={14}>{o}</T>
              </Touch>
            ))}
          </View>
        ) : null}

        {entries.map((entry, i) =>
          entry.role === 'user' ? (
            <View
              key={i}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '86%',
                backgroundColor: colors.plum,
                borderRadius: radius.lg,
                paddingHorizontal: 14,
                paddingVertical: 11,
              }}
            >
              <T size={14.5} c="#fff" style={{ lineHeight: 20 }}>{entry.text}</T>
            </View>
          ) : (
            <View key={i} style={{ gap: 12 }}>
              <T size={15} c={colors.ink} style={{ lineHeight: 22 }}>{entry.text}</T>

              {entry.places?.length ? (
                <View style={{ gap: 8 }}>
                  {entry.places.slice(0, 6).map((raw) => {
                    const item = toItem(raw);
                    return (
                      <Touch
                        key={item.id}
                        onPress={() => onOpenItem(item.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          padding: 10,
                          borderRadius: radius.lg,
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.line,
                        }}
                      >
                        <Photo uri={item.photoThumb ?? item.photo} label={item.title} radius={9} style={{ width: 42, height: 42 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <T s="med" size={14}>{item.title}</T>
                          <T s="soft" size={12} style={{ marginTop: 2 }}>{meta(item)}</T>
                        </View>
                        <T c={colors.faint} size={15}>›</T>
                      </Touch>
                    );
                  })}
                </View>
              ) : null}

              {entry.trip ? (
                <Touch
                  onPress={() => onOpenTrip(entry.trip!)}
                  style={{ padding: 14, borderRadius: radius.lg, backgroundColor: colors.ink }}
                >
                  <T s="med" size={14} c="#fff">Open “{entry.trip.title}” →</T>
                  <T size={12.5} c="rgba(255,255,255,0.7)" style={{ marginTop: 3 }}>
                    {entry.trip.days.length} day{entry.trip.days.length > 1 ? 's' : ''} ·{' '}
                    {entry.trip.days.reduce((n, d) => n + d.stops.length, 0)} stops
                  </T>
                </Touch>
              ) : null}
            </View>
          )
        )}

        {busy ? (
          <Row style={{ gap: 10 }}>
            <ActivityIndicator size="small" color={colors.plum} />
            <T s="soft" size={13}>Looking through your lists…</T>
          </Row>
        ) : null}
      </ScrollView>

      <Row style={{ paddingHorizontal: 22, paddingBottom: 96, gap: 10, alignItems: 'flex-end' }}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 16,
            borderRadius: radius.xxl,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => ask(draft)}
            placeholder={connection === 'online' ? 'Ask for something to do…' : 'Connect to the API to ask'}
            placeholderTextColor={colors.faint}
            editable={connection === 'online'}
            multiline
            style={{ paddingVertical: 12, maxHeight: 96, fontFamily: font.body, fontSize: 15, color: colors.ink, outlineStyle: 'none' } as any}
          />
        </View>
        <Touch
          onPress={() => ask(draft)}
          disabled={busy || !draft.trim()}
          label="Send"
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: draft.trim() ? colors.plum : colors.chip,
          }}
        >
          <T size={18} c={draft.trim() ? '#fff' : colors.faint}>↑</T>
        </Touch>
      </Row>
    </View>
  );
}
