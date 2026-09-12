import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { colors, radius, shadow, fmtScore, scoreColors } from '../theme';
import { CITIES, meta } from '../data';
import { Eyebrow, Initials, Photo, Row, ScoreDot, T, Touch } from '../components/ui';
import { useStore } from '../store';
import { ItemRanking, api } from '../api';
import { useAuth } from '../auth';

const PRICE = ['Free', 'Cheap', 'Mid', 'Spendy'];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 96 }}>
      <Eyebrow style={{ fontSize: 11, marginBottom: 4 }}>{label}</Eyebrow>
      <T s="med" size={14}>{value}</T>
    </View>
  );
}

export function Detail({
  id,
  top,
  onClose,
  onRank,
  onOpenActivity,
}: {
  id: number;
  top: number;
  onClose: () => void;
  onRank: (id: number) => void;
  onOpenActivity: (owner: string, itemId: number) => void;
}) {
  const { me, items, connection, toggleSave, isSaved, unrank } = useStore();
  const { token } = useAuth();
  const [theirs, setTheirs] = useState<ItemRanking[]>([]);

  useEffect(() => {
    if (connection !== 'online') return;
    let alive = true;
    api
      .itemRankings(token, id)
      .then((rows) => alive && setTheirs(rows))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [connection, token, id]);
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  const cityList = items.filter((i) => i.city === item.city && i.score != null).sort((a, b) => b.score! - a.score!);
  const myRank = cityList.findIndex((i) => i.id === item.id) + 1;
  const saved = isSaved(item.id);

  const duration = meta(item).split(' · ')[2];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Photo uri={item.photo} style={{ height: 300, justifyContent: 'flex-end', paddingHorizontal: 22, paddingBottom: 22 }}>
        <Touch
          onPress={onClose}
          style={{ position: 'absolute', top: top + 10, left: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}
        >
          <T size={18}>‹</T>
        </Touch>
        <View style={[shadow.soft, { alignSelf: 'flex-start', borderRadius: 32 }]}>
          <ScoreDot score={item.score} size={64} />
        </View>
      </Photo>
      {item.score != null ? (
        <T s="soft" size={11} style={{ paddingHorizontal: 22, paddingTop: 8, color: colors.faint }}>
          Your score · ranked #{myRank} of {cityList.length} in {CITIES[item.city]}
        </T>
      ) : null}

      <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
        <T s="soft" size={12} style={{ marginBottom: 6 }}>{CITIES[item.city]} · {item.hood}</T>
        <T s="serif" size={32} style={{ lineHeight: 34 }}>{item.title}</T>
        <T s="soft" size={13} style={{ marginTop: 8 }}>{meta(item)}</T>
        <T size={15} c={colors.ink2} style={{ marginTop: 16, lineHeight: 22 }}>{item.note}</T>
      </View>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 12 }}>Good to know</Eyebrow>
      <Row style={{ paddingHorizontal: 22, gap: 14, alignItems: 'flex-start' }}>
        <Fact label="Best time" value={item.bestTime || 'Any time'} />
        <Fact label="Takes" value={duration} />
        <Fact label="Cost" value={PRICE[item.price] ?? '—'} />
      </Row>

      {item.tip ? (
        <View style={{ marginHorizontal: 22, marginTop: 18, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
          <Eyebrow style={{ fontSize: 11, color: colors.plum, marginBottom: 6 }}>The move</Eyebrow>
          <T size={14} c={colors.ink2} style={{ lineHeight: 21 }}>{item.tip}</T>
        </View>
      ) : null}

      {item.tags.length ? (
        <Row style={{ flexWrap: 'wrap', gap: 8, paddingHorizontal: 22, paddingTop: 16 }}>
          {item.tags.map((t) => (
            <View key={t} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.sunken }}>
              <T size={13}>{t}</T>
            </View>
          ))}
        </Row>
      ) : null}

      {theirs.length ? (
        <>
          <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 10 }}>
            How your people rated it
          </Eyebrow>
          <Row style={{ flexWrap: 'wrap', gap: 10, paddingHorizontal: 22 }}>
            {theirs.map((f) => (
              <Row key={f.sub} style={{ gap: 8, paddingLeft: 8, paddingRight: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                <Initials name={f.name} color={f.color} size={26} />
                <T size={13}>{f.name}</T>
                <T s="semi" size={13} c={scoreColors(f.score)[0] === colors.chip ? colors.muted : scoreColors(f.score)[0]}>
                  {fmtScore(f.score)}
                </T>
              </Row>
            ))}
          </Row>
        </>
      ) : null}

      <Row style={{ gap: 10, paddingHorizontal: 22, paddingTop: 26 }}>
        <Touch onPress={() => onRank(item.id)} style={{ flex: 1, padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}>
          <T s="med" size={15} c="#fff">{item.score == null ? 'I’ve been' : 'Re-rank mine'}</T>
        </Touch>
        <Touch
          onPress={() => toggleSave(item.id)}
          style={{ flex: 1, padding: 16, borderRadius: radius.lg, backgroundColor: saved ? colors.sunken : colors.surface, borderWidth: 1, borderColor: '#d5cfc7', alignItems: 'center' }}
        >
          <T s="med" size={15}>{saved ? '✓ On your list' : 'Want to go'}</T>
        </Touch>
      </Row>

      {item.score != null && me ? (
        <Touch onPress={() => onOpenActivity(me.sub, item.id)} style={{ paddingHorizontal: 22, paddingTop: 22 }}>
          <T s="med" size={13} c={colors.plum}>See what people said about your take →</T>
        </Touch>
      ) : null}

      {item.score != null ? (
        <Touch onPress={() => unrank(item.id)} style={{ paddingHorizontal: 22, paddingTop: 18, alignItems: 'center' }}>
          <T s="soft" size={13} c={colors.faint}>Remove from my list</T>
        </Touch>
      ) : null}

      {item.wikipedia ? (
        <Touch onPress={() => Linking.openURL(item.wikipedia!)} style={{ paddingHorizontal: 22, paddingTop: 18 }}>
          <T s="med" size={13} c={colors.plum}>Read about it on Wikipedia →</T>
        </Touch>
      ) : null}

      {item.photoCredit ? (
        <T s="soft" size={11} style={{ paddingHorizontal: 22, paddingTop: 22, color: colors.faint, lineHeight: 16 }}>
          Photo: {item.photoCredit}{item.photoLicense ? ` · ${item.photoLicense}` : ''} · via Openverse
        </T>
      ) : null}
    </ScrollView>
  );
}
