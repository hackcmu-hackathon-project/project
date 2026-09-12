import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { colors, fmtScore, radius } from '../theme';
import { CATEGORIES, Category, meta } from '../data';
import { CityChips, Eyebrow, Hatch, Row, ScoreDot, T, Touch } from '../components/ui';
import { useStore } from '../store';

export function Explore({ top, onOpen }: { top: number; onOpen: (id: number) => void }) {
  const { city, setCity, items } = useStore();
  const [category, setCategory] = useState<Category | null>(null);

  const cityAll = useMemo(() => items.filter((i) => i.city === city), [items, city]);
  const shown = useMemo(
    () => (category ? cityAll.filter((i) => i.category === category) : cityAll),
    [cityAll, category]
  );
  const top1 = cityAll.find((i) => i.tier === 'loved') ?? cityAll[0];
  const hoods = useMemo(() => {
    const m: Record<string, number> = {};
    cityAll.forEach((i) => (m[i.hood] = (m[i.hood] ?? 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [cityAll]);
  const present = useMemo(
    () => CATEGORIES.filter((c) => cityAll.some((i) => i.category === c)),
    [cityAll]
  );

  if (!top1) return null;

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
            {top1.hood} · {top1.category} · avg {fmtScore(top1.score ?? 8.9)}
          </T>
        </Hatch>
      </Touch>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 12 }}>What kind of thing</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}>
        {[null, ...present].map((c) => {
          const on = category === c;
          return (
            <Touch
              key={c ?? 'all'}
              onPress={() => setCategory(c as Category | null)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: on ? colors.ink : colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <T s="med" size={13} c={on ? '#fff' : colors.ink}>{c ?? 'Everything'}</T>
            </Touch>
          );
        })}
      </ScrollView>

      <Row style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 6, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow>{category ?? 'Popular'} right now</Eyebrow>
        <T s="soft" size={13}>{shown.length} things</T>
      </Row>
      {shown.map((t) => (
        <Touch
          key={t.id}
          onPress={() => onOpen(t.id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#ebe6df' }}
        >
          <Hatch style={{ width: 56, height: 56, borderRadius: 10 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s="med" size={15} style={{ lineHeight: 19 }}>{t.title}</T>
            <T s="soft" size={12} style={{ marginTop: 3 }}>{meta(t)}</T>
          </View>
          {t.score != null ? <ScoreDot score={t.score} size={38} /> : null}
        </Touch>
      ))}

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10 }}>By neighborhood</Eyebrow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, gap: 10 }}>
        {hoods.map(([name, count]) => (
          <View key={name} style={{ flexGrow: 1, flexBasis: '46%', padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
            <T s="serif" size={20}>{name}</T>
            <T s="soft" size={12} style={{ marginTop: 2 }}>{count} things to do</T>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
