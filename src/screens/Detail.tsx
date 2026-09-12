import React from 'react';
import { ScrollView, View } from 'react-native';
import { colors, radius, shadow, fmtScore, scoreColors } from '../theme';
import { CITIES, meta } from '../data';
import { Eyebrow, Hatch, Initials, Row, ScoreDot, T, Touch } from '../components/ui';
import { useStore } from '../store';

const PRICE = ['Free', 'Cheap', 'Mid', 'Spendy'];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 96 }}>
      <Eyebrow style={{ fontSize: 11, marginBottom: 4 }}>{label}</Eyebrow>
      <T s="med" size={14}>{value}</T>
    </View>
  );
}

export function Detail({ id, top, onClose, onRank }: { id: number; top: number; onClose: () => void; onRank: (id: number) => void }) {
  const { items, feed } = useStore();
  const item = items.find((i) => i.id === id);
  const friends = feed.filter((p) => p.item.id === id);
  if (!item) return null;

  const duration = meta(item).split(' · ')[2];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Hatch style={{ height: 300, justifyContent: 'flex-end', paddingHorizontal: 22, paddingBottom: 22 }}>
        <Touch
          onPress={onClose}
          style={{ position: 'absolute', top: top + 10, left: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}
        >
          <T size={18}>‹</T>
        </Touch>
        <T size={10} c="#8a837b" style={{ position: 'absolute', top: top + 18, right: 22, fontFamily: 'monospace' }}>{item.img}</T>
        <View style={[shadow.soft, { alignSelf: 'flex-start', borderRadius: 32 }]}>
          <ScoreDot score={item.score} size={64} />
        </View>
      </Hatch>

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

      {friends.length ? (
        <>
          <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 10 }}>Friends who ranked it</Eyebrow>
          <Row style={{ flexWrap: 'wrap', gap: 10, paddingHorizontal: 22 }}>
            {friends.map((f) => (
              <Row key={f.id} style={{ gap: 8, paddingLeft: 8, paddingRight: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                <Initials name={f.userName} color={f.userColor} size={26} />
                <T size={13}>{f.userName}</T>
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
          <T s="med" size={15} c="#fff">{item.score == null ? 'I’ve been' : 'Re-rank'}</T>
        </Touch>
        <Touch style={{ flex: 1, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#d5cfc7', alignItems: 'center' }}>
          <T s="med" size={15}>Want to go</T>
        </Touch>
      </Row>
    </ScrollView>
  );
}
