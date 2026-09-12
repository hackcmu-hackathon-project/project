import React from 'react';
import { ScrollView, View } from 'react-native';
import { colors, font, scoreColors, fmtScore } from '../theme';
import { CITIES, FEED, itemById } from '../data';
import { Hatch, Initials, Row, ScoreDot, T, Touch } from '../components/ui';

export function Feed({ top, onOpen }: { top: number; onOpen: (id: number) => void }) {
  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <Row style={{ alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 14 }}>
        <T s="serif" size={36}>Rove</T>
        <T s="soft" size={13}>Friends · this week</T>
      </Row>

      {FEED.map((p) => {
        const item = itemById(p.itemId);
        return (
          <Touch key={p.id} onPress={() => onOpen(item.id)} style={{ paddingHorizontal: 22, paddingVertical: 18, borderTopWidth: 1, borderTopColor: colors.hair }}>
            <Row style={{ gap: 10, marginBottom: 12 }}>
              <Initials name={p.friend.name} color={p.friend.color} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={14}>
                  <T s="semi" size={14}>{p.friend.name}</T>
                  <T s="soft" size={14}>{`  ${p.action}`}</T>
                </T>
                <T size={12} c={colors.faint} style={{ marginTop: 2 }}>
                  {CITIES[item.city]} · {p.time}
                </T>
              </View>
              <ScoreDot score={p.score} />
            </Row>

            <Row style={{ gap: 14, alignItems: 'flex-start' }}>
              <Hatch style={{ width: 96, height: 96, borderRadius: 12, justifyContent: 'flex-end', padding: 6 }}>
                <T size={9} c="#8a837b" style={{ fontFamily: 'monospace' }}>{p.img}</T>
              </Hatch>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T s="serif" size={22} style={{ lineHeight: 25, marginBottom: 4 }}>{item.title}</T>
                <T s="soft" size={12} style={{ marginBottom: 8 }}>
                  {item.hood} · {item.stops} stops · {item.hours}h
                </T>
                <T size={14} c={colors.ink2} style={{ lineHeight: 20 }}>{p.note}</T>
              </View>
            </Row>

            <Row style={{ gap: 18, marginTop: 14 }}>
              <T s="soft" size={13}>♡ {p.likes}</T>
              <T s="soft" size={13}>{p.comments} comments</T>
              <View style={{ flex: 1 }} />
              <T s="med" size={13} c={colors.plum}>Copy itinerary →</T>
            </Row>
          </Touch>
        );
      })}
    </ScrollView>
  );
}
