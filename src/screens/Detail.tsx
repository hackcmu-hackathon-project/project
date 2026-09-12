import React from 'react';
import { ScrollView, View } from 'react-native';
import { colors, radius, shadow } from '../theme';
import { CITIES, FEED, itemById } from '../data';
import { Eyebrow, Hatch, Initials, Row, ScoreDot, T, Touch } from '../components/ui';
import { fmtScore, scoreColors } from '../theme';

export function Detail({ id, top, onClose, onRank }: { id: number; top: number; onClose: () => void; onRank: (id: number) => void }) {
  const item = itemById(id);
  const friends = FEED.filter((p) => p.itemId === id);

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
        <T s="soft" size={13} style={{ marginTop: 8 }}>{item.stops} stops · about {item.hours} hours</T>
        <T size={15} c={colors.ink2} style={{ marginTop: 16, lineHeight: 22 }}>{item.note}</T>
      </View>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 10 }}>The itinerary</Eyebrow>
      <View style={{ paddingHorizontal: 22 }}>
        {item.stopsList.map((s, i) => {
          const last = i === item.stopsList.length - 1;
          return (
            <Row key={i} style={{ gap: 16, paddingVertical: 10, alignItems: 'stretch' }}>
              <T s="soft" size={12} style={{ width: 64, paddingTop: 3 }}>{s.time}</T>
              <View style={{ width: 8, alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.plum, marginTop: 6 }} />
                {!last ? <View style={{ flex: 1, width: 1, backgroundColor: colors.line, marginTop: 4 }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 10 }}>
                <T s="med" size={15}>{s.name}</T>
                {s.detail ? <T s="soft" size={12} style={{ marginTop: 2 }}>{s.detail}</T> : null}
              </View>
            </Row>
          );
        })}
      </View>

      {friends.length ? (
        <>
          <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 10 }}>Friends who ranked it</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 22 }}>
            {friends.map((f) => (
              <Row key={f.id} style={{ gap: 8, paddingLeft: 8, paddingRight: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                <Initials name={f.friend.name} color={f.friend.color} size={26} />
                <T size={13}>{f.friend.name}</T>
                <T s="semi" size={13} c={scoreColors(f.score)[0] === colors.chip ? colors.muted : scoreColors(f.score)[0]}>
                  {fmtScore(f.score)}
                </T>
              </Row>
            ))}
          </View>
        </>
      ) : null}

      <Row style={{ gap: 10, paddingHorizontal: 22, paddingTop: 26 }}>
        <Touch style={{ flex: 1, padding: 16, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}>
          <T s="med" size={15} c="#fff">Copy itinerary</T>
        </Touch>
        <Touch onPress={() => onRank(item.id)} style={{ flex: 1, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#d5cfc7', alignItems: 'center' }}>
          <T s="med" size={15}>{item.score == null ? 'Rank it' : 'Re-rank'}</T>
        </Touch>
      </Row>
    </ScrollView>
  );
}
