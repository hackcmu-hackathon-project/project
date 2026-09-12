import React from 'react';
import { ScrollView, View } from 'react-native';
import { colors } from '../theme';
import { CITIES } from '../data';
import { CityChips, Eyebrow, Hatch, Row, ScoreDot, T, Touch } from '../components/ui';
import { useStore } from '../store';

export function Lists({ top, onOpen, onRank }: { top: number; onOpen: (id: number) => void; onRank: (id: number) => void }) {
  const { city, setCity, ranked, wants } = useStore();
  const list = ranked(city);
  const want = wants(city);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <Row style={{ alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 6 }}>
        <T s="serif" size={36}>My {CITIES[city]}</T>
        <T s="soft" size={13}>{list.length} ranked</T>
      </Row>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 18 }}>
        <CityChips city={city} onChange={setCity} />
      </View>

      {list.map((r, i) => (
        <Touch key={r.id} onPress={() => onOpen(r.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#ebe6df' }}>
          <T s="serif" size={20} c={colors.faint} style={{ width: 22, textAlign: 'right' }}>{i + 1}</T>
          <Hatch style={{ width: 52, height: 52, borderRadius: 10 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s="med" size={15} style={{ lineHeight: 19 }}>{r.title}</T>
            <T s="soft" size={12} style={{ marginTop: 3 }}>{r.hood} · {r.stops} stops · {r.hours}h</T>
          </View>
          <ScoreDot score={r.score} size={38} />
        </Touch>
      ))}

      {list.length === 0 ? (
        <View style={{ paddingHorizontal: 22, paddingVertical: 26 }}>
          <T s="soft" size={14}>Nothing ranked in {CITIES[city]} yet. Tap ＋ and start with the best thing you did.</T>
        </View>
      ) : null}

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 8 }}>Want to try</Eyebrow>
      {want.map((w) => (
        <Touch key={w.id} onPress={() => onRank(w.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#ebe6df' }}>
          <View style={{ width: 22 }} />
          <Hatch style={{ width: 52, height: 52, borderRadius: 10, opacity: 0.6 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s="med" size={15} style={{ lineHeight: 19 }}>{w.title}</T>
            <T s="soft" size={12} style={{ marginTop: 3 }}>{w.hood} · {w.stops} stops · {w.hours}h</T>
          </View>
          <T s="med" size={13} c={colors.plum}>Rank</T>
        </Touch>
      ))}
    </ScrollView>
  );
}
