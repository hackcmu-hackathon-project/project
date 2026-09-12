import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { CATEGORIES, colors, fmtScore, font, radius } from '../theme';
import { CITIES, Category, meta } from '../data';
import { CityChips, Eyebrow, Hatch, Photo, Row, ScoreDot, T, Touch } from '../components/ui';
import { useStore } from '../store';
import { OfflineBanner } from '../components/Offline';

export function Explore({ top, onOpen }: { top: number; onOpen: (id: number) => void }) {
  const { city, setCity, items, connection, refresh } = useStore();
  const [category, setCategory] = useState<Category | null>(null);
  const [limit, setLimit] = useState(24);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const pull = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const cityAll = useMemo(() => items.filter((i) => i.city === city), [items, city]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cityAll
      .filter((i) => !category || i.category === category)
      .filter(
        (i) =>
          !needle ||
          i.title.toLowerCase().includes(needle) ||
          i.hood.toLowerCase().includes(needle) ||
          i.tags.some((t) => t.toLowerCase().includes(needle))
      );
  }, [cityAll, category, q]);
  const top1 = cityAll.find((i) => i.tier === 'loved') ?? cityAll[0];
  const hoods = useMemo(() => {
    const m: Record<string, number> = {};
    cityAll.forEach((i) => (m[i.hood] = (m[i.hood] ?? 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [cityAll]);
  const present = useMemo(
    () => CATEGORIES.filter((c: Category) => cityAll.some((i) => i.category === c)),
    [cityAll]
  );

  if (!top1) return null;

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.soft} />}
    >
      <T s="serif" size={36} style={{ paddingHorizontal: 22, paddingBottom: 4 }}>Explore</T>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 }}>
        <CityChips city={city} onChange={setCity} />
      </View>

      <OfflineBanner connection={connection} onRetry={refresh} />

      <Touch onPress={() => onOpen(top1.id)} style={{ marginHorizontal: 22 }}>
        <Photo uri={top1.photo} radius={radius.xxl} style={{ padding: 22, minHeight: 220, justifyContent: 'flex-end' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(20,17,15,0.42)' }} />
          <Eyebrow style={{ color: colors.plumSoft, marginBottom: 8 }}>Top ranked by friends</Eyebrow>
          <T s="serif" size={28} c="#fff" style={{ lineHeight: 31 }}>{top1.title}</T>
          <T size={13} c="rgba(255,255,255,0.7)" style={{ marginTop: 6 }}>
            {top1.hood} · {top1.category} · avg {fmtScore(top1.score ?? 8.9)}
          </T>
        </Photo>
      </Touch>

      <View style={{ marginHorizontal: 22, marginTop: 22, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
        <TextInput
          value={q}
          onChangeText={(v) => { setQ(v); setLimit(24); }}
          placeholder={`Search ${cityAll.length} things to do`}
          placeholderTextColor={colors.faint}
          style={{ paddingVertical: 12, fontFamily: font.body, fontSize: 15, color: colors.ink, outlineStyle: 'none' } as any}
        />
      </View>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 12 }}>What kind of thing</Eyebrow>
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
        <Eyebrow>{q ? 'Results' : `${category ?? 'Everything'} in ${CITIES[city]}`}</Eyebrow>
        <T s="soft" size={13}>{shown.length} things</T>
      </Row>
      {shown.length === 0 ? (
        <T s="soft" size={14} style={{ paddingHorizontal: 22, paddingTop: 14, lineHeight: 21 }}>
          Nothing matches “{q}”. Tap ＋ to add it to the catalogue.
        </T>
      ) : null}

      {shown.slice(0, limit).map((t) => (
        <Touch
          key={t.id}
          onPress={() => onOpen(t.id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#ebe6df' }}
        >
          <Photo uri={t.photoThumb ?? t.photo} radius={10} style={{ width: 56, height: 56 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s="med" size={15} style={{ lineHeight: 19 }}>{t.title}</T>
            <T s="soft" size={12} style={{ marginTop: 3 }}>{meta(t)}</T>
          </View>
          {t.score != null ? <ScoreDot score={t.score} size={38} /> : null}
        </Touch>
      ))}

      {shown.length > limit ? (
        <Touch onPress={() => setLimit((n) => n + 40)} style={{ paddingVertical: 18, alignItems: 'center' }}>
          <T s="med" size={13.5} c={colors.plum}>Show {Math.min(40, shown.length - limit)} more</T>
        </Touch>
      ) : null}

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
