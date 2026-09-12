import React, { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { colors, radius } from '../theme';
import { CITIES, meta } from '../data';
import { Initials, Photo, Row, ScoreDot, T, Touch } from '../components/ui';
import { FeedRow, useStore } from '../store';
import { OfflineBanner } from '../components/Offline';
import { EMOJI } from '../components/Reactions';

export function Feed({
  top,
  onOpenItem,
  onOpenActivity,
  onFindPeople,
  onOpenPerson,
}: {
  top: number;
  onOpenItem: (id: number) => void;
  onOpenActivity: (owner: string, itemId: number) => void;
  onFindPeople: () => void;
  onOpenPerson: (sub: string) => void;
}) {
  const { feed, connection, toggleSave, react, refresh, feedScope, setFeedScope, myScore } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const pull = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const open = (f: FeedRow) =>
    f.userSub ? onOpenActivity(f.userSub, f.item.id) : onOpenItem(f.item.id);

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.soft} />}
    >
      <Row style={{ alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 12 }}>
        <T s="serif" size={36}>Rove</T>
        <Row style={{ gap: 6 }}>
          {(['following', 'everyone'] as const).map((scope) => (
            <Touch
              key={scope}
              onPress={() => setFeedScope(scope)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.pill,
                backgroundColor: feedScope === scope ? colors.ink : 'transparent',
                borderWidth: 1,
                borderColor: feedScope === scope ? colors.ink : colors.line,
              }}
            >
              <T s="med" size={12} c={feedScope === scope ? '#fff' : colors.soft}>
                {scope === 'following' ? 'Following' : 'Everyone'}
              </T>
            </Touch>
          ))}
        </Row>
      </Row>

      <OfflineBanner connection={connection} onRetry={refresh} />

      {feed.length === 0 && connection === 'online' ? (
        <Touch
          onPress={onFindPeople}
          style={{ marginHorizontal: 22, marginTop: 8, padding: 20, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
        >
          <T s="serif" size={22}>
            {feedScope === 'following' ? 'Your feed is the people you follow' : 'Nobody has ranked anything yet'}
          </T>
          <T s="soft" size={13.5} style={{ marginTop: 8, lineHeight: 20 }}>
            {feedScope === 'following'
              ? 'Nobody you follow has ranked anything yet. Find people by name or @handle and their takes land here. →'
              : 'Be the first — tap ＋ and rank something you did.'}
          </T>
        </Touch>
      ) : null}

      {feed.map((f) => {
        const item = f.item;
        return (
          <View key={f.id} style={{ paddingHorizontal: 22, paddingVertical: 18, borderTopWidth: 1, borderTopColor: colors.hair }}>
            <Row style={{ gap: 10, marginBottom: 12 }}>
              <Touch onPress={() => f.userSub && onOpenPerson(f.userSub)} label={`${f.userName}'s profile`}>
                <Initials name={f.userName} color={f.userColor} />
              </Touch>
              <Touch onPress={() => open(f)} style={{ flex: 1, minWidth: 0 }}>
                <T size={14}>
                  <T s="semi" size={14}>{f.userName}</T>
                  <T s="soft" size={14}>{`  ${f.action}`}</T>
                </T>
                <T size={12} c={colors.faint} style={{ marginTop: 2 }}>
                  {CITIES[item.city]} · {f.time}
                </T>
              </Touch>
              <ScoreDot score={f.score} />
            </Row>

            <Touch onPress={() => open(f)}>
              <Row style={{ gap: 14, alignItems: 'flex-start' }}>
                <Photo uri={item.photoThumb ?? item.photo} label={item.title} radius={12} style={{ width: 96, height: 96 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T s="serif" size={22} style={{ lineHeight: 25, marginBottom: 4 }}>{item.title}</T>
                  <T s="soft" size={12} style={{ marginBottom: 8 }}>{meta(item)}</T>
                  {f.note ? <T size={14} c={colors.ink2} style={{ lineHeight: 20 }}>{f.note}</T> : null}
                </View>
              </Row>
            </Touch>

            <Row style={{ gap: 6, marginTop: 14 }}>
              {EMOJI.map((e) => {
                const n = f.reactions[e] ?? 0;
                const on = f.myReaction === e;
                return (
                  <Touch
                    key={e}
                    onPress={() => f.userSub && react(f.userSub, item.id, e)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 9,
                      paddingVertical: 6,
                      borderRadius: radius.pill,
                      backgroundColor: on ? colors.plum : colors.surface,
                      borderWidth: 1,
                      borderColor: on ? colors.plum : colors.line,
                    }}
                  >
                    <T size={13}>{e}</T>
                    {n > 0 ? <T s="med" size={12} c={on ? '#fff' : colors.soft}>{n}</T> : null}
                  </Touch>
                );
              })}
            </Row>

            <Row style={{ marginTop: 10 }}>
              <Touch onPress={() => open(f)} style={{ paddingVertical: 2 }} label="Comments">
                <T s="soft" size={13}>{f.comments ? `${f.comments} comment${f.comments === 1 ? '' : 's'}` : 'Comment'}</T>
              </Touch>
              <View style={{ flex: 1 }} />
              {myScore(item.id) != null ? (
                <Touch onPress={() => onOpenItem(item.id)} style={{ paddingVertical: 2 }} label="Your ranking">
                  <T s="med" size={13} c={colors.muted}>You gave it {myScore(item.id)!.toFixed(1)}</T>
                </Touch>
              ) : (
                <Touch
                  onPress={() => toggleSave(item.id)}
                  style={{ paddingVertical: 2 }}
                  label={f.saved ? 'Remove from want to go' : 'Add to want to go'}
                >
                  <T s="med" size={13} c={f.saved ? colors.muted : colors.plum}>
                    {f.saved ? '✓ Want to go' : 'Want to go'}
                  </T>
                </Touch>
              )}
            </Row>
          </View>
        );
      })}
    </ScrollView>
  );
}
