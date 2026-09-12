import React, { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { colors } from '../theme';
import { CITIES, meta } from '../data';
import { CityChips, Eyebrow, Photo, Row, ScoreDot, T, Touch } from '../components/ui';
import { useStore } from '../store';
import { OfflineBanner } from '../components/Offline';

export function Lists({ top, onOpen, onRank }: { top: number; onOpen: (id: number) => void; onRank: (id: number) => void }) {
  const { city, setCity, ranked, saves, connection, refresh } = useStore();
  const list = ranked(city);
  // The API already drops anything you've ranked; this keeps the optimistic
  // local state honest between a rank and the next refresh.
  const unvisited = saves.filter((s) => s.score == null);
  const want = unvisited.filter((s) => s.city === city);
  const elsewhere = unvisited.length - want.length;
  const otherCity = city === 'sf' ? 'nyc' : 'sf';
  const [refreshing, setRefreshing] = useState(false);
  const pull = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.soft} />}
    >
      <Row style={{ alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 6 }}>
        <T s="serif" size={36}>My {CITIES[city]}</T>
        <T s="soft" size={13}>{list.length} ranked</T>
      </Row>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 18 }}>
        <CityChips city={city} onChange={setCity} />
      </View>

      <OfflineBanner connection={connection} onRetry={refresh} />

      {list.map((r, i) => (
        <Touch key={r.id} onPress={() => onOpen(r.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#ebe6df' }}>
          <T s="serif" size={20} c={colors.faint} style={{ width: 22, textAlign: 'right' }}>{i + 1}</T>
          <Photo uri={r.photoThumb ?? r.photo} radius={10} style={{ width: 52, height: 52 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s="med" size={15} style={{ lineHeight: 19 }}>{r.title}</T>
            <T s="soft" size={12} style={{ marginTop: 3 }}>{meta(r)}</T>
          </View>
          <ScoreDot score={r.score} size={38} />
        </Touch>
      ))}

      {list.length === 0 ? (
        <View style={{ paddingHorizontal: 22, paddingVertical: 26 }}>
          <T s="soft" size={14}>Nothing ranked in {CITIES[city]} yet. Tap ＋ and start with the best thing you did.</T>
        </View>
      ) : null}

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 8 }}>Want to go</Eyebrow>
      {want.length === 0 ? (
        <T s="soft" size={13.5} style={{ paddingHorizontal: 22, paddingBottom: 4, lineHeight: 20 }}>
          Nothing saved in {CITIES[city]} yet. Tap “Want to go” on anything and it lands here.
        </T>
      ) : null}
      {elsewhere > 0 ? (
        <Touch onPress={() => setCity(otherCity)} style={{ paddingHorizontal: 22, paddingBottom: 8 }}>
          <T s="med" size={13} c={colors.plum}>
            {elsewhere} more saved in {CITIES[otherCity]} →
          </T>
        </Touch>
      ) : null}
      {want.map((w) => (
        <Touch key={w.id} onPress={() => onRank(w.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#ebe6df' }}>
          <View style={{ width: 22 }} />
          <Photo uri={w.photoThumb ?? w.photo} radius={10} style={{ width: 52, height: 52 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s="med" size={15} style={{ lineHeight: 19 }}>{w.title}</T>
            <T s="soft" size={12} style={{ marginTop: 3 }}>{meta(w)}</T>
          </View>
          <T s="med" size={13} c={colors.plum}>Rank</T>
        </Touch>
      ))}
    </ScrollView>
  );
}
