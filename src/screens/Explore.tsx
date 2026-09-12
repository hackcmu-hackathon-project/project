import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { colors, fmtScore, radius } from '../theme';
import { CITIES } from '../data';
import { CityChips, Eyebrow, Hatch, Row, T, Touch } from '../components/ui';
import { useStore } from '../store';

export function Explore({ top, onOpen }: { top: number; onOpen: (id: number) => void }) {
  const { city, setCity, items } = useStore();
  const cityAll = useMemo(() => items.filter((i) => i.city === city), [items, city]);
  const top1 = cityAll.find((i) => i.tier === 'loved') ?? cityAll[0];
  const hoods = useMemo(() => {
    const m: Record<string, number> = {};
    cityAll.forEach((i) => (m[i.hood] = (m[i.hood] ?? 0) + 1));
    return Object.entries(m).slice(0, 6);
  }, [cityAll]);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <T s="serif" size={36} style={{ paddingHorizontal: 22, paddingBottom: 4 }}>Explore</T>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 }}>
        <CityChips city={city} onChange={setCity} />
      </View>

      <Touch onPress={() => onOpen(top1.id)} style={{ marginHorizontal: 22 }}>
        <Hatch dark style={{ borderRadius: radius.xxl, padding: 22, minHeight: 220, justifyContent: 'flex-end' }}>
          <Eyebrow style={{ color: colors.plumSoft, marginBottom: 8 }}>Top ranked by friends</Eyebrow>
          <T s="serif" size={28} c="#fff" style={{ lineHeight: 31 }}>{top1.title}</T>
          <T size={13} c="rgba(255,255,255,0.7)" style={{ marginTop: 6 }}>
            {top1.hood} · {top1.stops} stops · avg {fmtScore(top1.score ?? 8.9)}
          </T>
        </Hatch>
      </Touch>

      <Row style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow>Trending itineraries</Eyebrow>
        <T size={13} c={colors.plum}>See all</T>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, gap: 12, paddingBottom: 8 }}>
        {cityAll.slice(0, 5).map((t) => (
          <Touch key={t.id} onPress={() => onOpen(t.id)} style={{ width: 180 }}>
            <Hatch style={{ height: 130, borderRadius: radius.lg, marginBottom: 10 }}>
              <View style={{ position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: '#fff' }}>
                <T s="semi" size={11}>{fmtScore(t.score ?? 7.5)}</T>
              </View>
            </Hatch>
            <T s="med" size={14} style={{ lineHeight: 18 }}>{t.title}</T>
            <T s="soft" size={12} style={{ marginTop: 3 }}>{t.hood} · {t.hours}h</T>
          </Touch>
        ))}
      </ScrollView>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10 }}>By neighborhood</Eyebrow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, gap: 10 }}>
        {hoods.map(([name, count]) => (
          <View key={name} style={{ flexGrow: 1, flexBasis: '46%', padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
            <T s="serif" size={20}>{name}</T>
            <T s="soft" size={12} style={{ marginTop: 2 }}>{count} experiences</T>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
