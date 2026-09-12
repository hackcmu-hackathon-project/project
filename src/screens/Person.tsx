import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { colors, radius, fmtScore } from '../theme';
import { CITIES, meta } from '../data';
import { ApiRanking, Person as PersonType, api, toItem } from '../api';
import { Eyebrow, Initials, Photo, Row, ScoreDot, T, Touch } from '../components/ui';
import { useAuth } from '../auth';
import { useStore } from '../store';

/** Somebody else's profile: who they are, and everything they've ranked. */
export function Person({
  sub,
  top,
  onClose,
  onOpenActivity,
}: {
  sub: string;
  top: number;
  onClose: () => void;
  onOpenActivity: (owner: string, itemId: number) => void;
}) {
  const { token } = useAuth();
  const { refresh } = useStore();
  const [person, setPerson] = useState<PersonType | null>(null);
  const [rows, setRows] = useState<ApiRanking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api.person(token, sub), api.personRankings(token, sub)]);
      setPerson(p);
      setRows(r);
    } catch {
      setError('Could not load that profile.');
    }
  }, [token, sub]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!person) return;
    const wasFollowing = person.following;
    setPerson({ ...person, following: !wasFollowing, followers: person.followers + (wasFollowing ? -1 : 1) });
    try {
      if (wasFollowing) await api.unfollow(token, sub);
      else await api.follow(token, sub);
      refresh();
    } catch {
      load();
    }
  };

  if (error) {
    return (
      <View style={{ flex: 1, paddingTop: top + 40, paddingHorizontal: 22 }}>
        <T s="soft" size={14}>{error}</T>
        <Touch onPress={onClose} style={{ paddingVertical: 20 }}><T s="med" size={14}>Back</T></Touch>
      </View>
    );
  }
  if (!person) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.plum} />
      </View>
    );
  }

  const byCity = (city: 'sf' | 'nyc') => rows.filter((r) => r.item.city === city);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <Row style={{ paddingHorizontal: 22, justifyContent: 'flex-end' }}>
        <Touch onPress={onClose}><T s="soft" size={14}>Done</T></Touch>
      </Row>

      <View style={{ alignItems: 'center', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 }}>
        <Initials name={person.name} color={person.color} size={72} />
        <T s="serif" size={28} style={{ marginTop: 12 }}>{person.name}</T>
        <T s="soft" size={13} style={{ marginTop: 2 }}>@{person.handle}</T>
        {person.bio ? (
          <T s="soft" size={13.5} style={{ marginTop: 8, textAlign: 'center', lineHeight: 20 }}>{person.bio}</T>
        ) : null}
        <Row style={{ gap: 28, marginTop: 16 }}>
          <View style={{ alignItems: 'center' }}>
            <T s="serif" size={22}>{person.ranked}</T>
            <T s="soft" size={12}>Ranked</T>
          </View>
          <View style={{ alignItems: 'center' }}>
            <T s="serif" size={22}>{person.followers}</T>
            <T s="soft" size={12}>Followers</T>
          </View>
        </Row>
        <Touch
          onPress={toggleFollow}
          style={{
            marginTop: 18,
            paddingHorizontal: 22,
            paddingVertical: 11,
            borderRadius: radius.pill,
            backgroundColor: person.following ? colors.surface : colors.ink,
            borderWidth: 1,
            borderColor: person.following ? colors.border : colors.ink,
          }}
        >
          <T s="med" size={14} c={person.following ? colors.muted : '#fff'}>
            {person.following ? 'Following' : 'Follow'}
          </T>
        </Touch>
      </View>

      {(['sf', 'nyc'] as const).map((city) => {
        const list = byCity(city);
        if (!list.length) return null;
        return (
          <View key={city}>
            <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 6 }}>
              Their {CITIES[city]} · {list.length} ranked
            </Eyebrow>
            {list.map((r, i) => {
              const item = toItem(r.item);
              return (
                <Touch
                  key={r.item_id}
                  onPress={() => onOpenActivity(sub, r.item_id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#ebe6df' }}
                >
                  <T s="serif" size={20} c={colors.faint} style={{ width: 22, textAlign: 'right' }}>{i + 1}</T>
                  <Photo uri={item.photoThumb ?? item.photo} radius={10} style={{ width: 52, height: 52 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T s="med" size={15} style={{ lineHeight: 19 }}>{item.title}</T>
                    <T s="soft" size={12} style={{ marginTop: 3 }}>{meta(item)}</T>
                  </View>
                  <ScoreDot score={r.score} size={38} />
                </Touch>
              );
            })}
          </View>
        );
      })}

      {rows.length === 0 ? (
        <T s="soft" size={14} style={{ paddingHorizontal: 22, paddingTop: 10 }}>
          {person.name} hasn’t ranked anything yet.
        </T>
      ) : null}
    </ScrollView>
  );
}
