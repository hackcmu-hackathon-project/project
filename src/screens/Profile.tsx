import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { colors, radius } from '../theme';
import { CityKey } from '../data';
import { Me, Person, api } from '../api';
import { Eyebrow, Initials, Row, T, Touch } from '../components/ui';
import { useStore } from '../store';
import { useAuth } from '../auth';

const TASTE = ['Early mornings', 'Long walks', 'Food-led', 'Skips the famous stuff'];

export function Profile({ top, onOpenCity, onFindPeople }: { top: number; onOpenCity: (c: CityKey) => void; onFindPeople: () => void }) {
  const { ranked, connection } = useStore();
  const { user, token, signOut, configured } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [following, setFollowing] = useState<Person[]>([]);

  const load = useCallback(async () => {
    if (connection !== 'online') return;
    try {
      const [profile, people] = await Promise.all([api.me(token), api.following(token)]);
      setMe(profile);
      setFollowing(people);
    } catch {
      /* the offline banner below already explains it */
    }
  }, [connection, token]);

  useEffect(() => {
    load();
  }, [load]);

  const sf = ranked('sf');
  const nyc = ranked('nyc');
  const name = me?.name ?? user?.name ?? 'Traveler';

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24 }}>
        <Initials name={name} color={colors.plum} size={76} />
        <T s="serif" size={30} style={{ marginTop: 12 }}>{name}</T>
        <T s="soft" size={13} style={{ marginTop: 2 }}>
          {me?.handle ? `@${me.handle}` : user?.email ?? '@you'}
          {me?.bio ? ` · ${me.bio}` : ''}
        </T>
      </View>

      <Row style={{ justifyContent: 'center', gap: 36, paddingBottom: 26 }}>
        {[
          [String(sf.length + nyc.length), 'Ranked'],
          [String(me?.following ?? following.length), 'Following'],
          [String(me?.followers ?? 0), 'Followers'],
        ].map(([n, l]) => (
          <View key={l} style={{ alignItems: 'center' }}>
            <T s="serif" size={26}>{n}</T>
            <T s="soft" size={12}>{l}</T>
          </View>
        ))}
      </Row>

      <Eyebrow style={{ paddingHorizontal: 22, paddingBottom: 10 }}>Your cities</Eyebrow>
      <View style={{ paddingHorizontal: 22, gap: 10 }}>
        {([['sf', 'San Francisco', sf], ['nyc', 'New York', nyc]] as const).map(([key, label, list]) => (
          <Touch
            key={key}
            onPress={() => onOpenCity(key as CityKey)}
            style={{ padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flex: 1 }}>
              <T s="serif" size={22}>{label}</T>
              <T s="soft" size={12} style={{ marginTop: 2 }}>
                {list.length} ranked · top: {list[0]?.title ?? '–'}
              </T>
            </View>
            <T c={colors.faint} size={16}>›</T>
          </Touch>
        ))}
      </View>

      <Row style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow>Your circle</Eyebrow>
        <Touch onPress={onFindPeople}><T s="med" size={13} c={colors.plum}>Find people</T></Touch>
      </Row>
      {following.length ? (
        <View style={{ paddingHorizontal: 22, gap: 10 }}>
          {following.slice(0, 5).map((p) => (
            <Row key={p.sub} style={{ gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
              <Initials name={p.name} color={p.color} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T s="med" size={14}>{p.name}</T>
                <T s="soft" size={12} style={{ marginTop: 2 }}>@{p.handle} · {p.ranked} ranked</T>
              </View>
            </Row>
          ))}
        </View>
      ) : (
        <Touch
          onPress={onFindPeople}
          style={{ marginHorizontal: 22, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
        >
          <T s="med" size={14}>Follow someone</T>
          <T s="soft" size={12.5} style={{ marginTop: 4, lineHeight: 19 }}>
            Your feed is everyone you follow. Find people by name or @handle and it fills up.
          </T>
        </Touch>
      )}

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10 }}>Taste</Eyebrow>
      <Row style={{ flexWrap: 'wrap', gap: 8, paddingHorizontal: 22 }}>
        {TASTE.map((t) => (
          <View key={t} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.sunken }}>
            <T size={13}>{t}</T>
          </View>
        ))}
      </Row>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10 }}>Account</Eyebrow>
      <View style={{ paddingHorizontal: 22 }}>
        <T s="soft" size={12} style={{ marginBottom: 10, lineHeight: 18 }}>
          {connection === 'online'
            ? `Saved to MongoDB via the Rove API${configured ? ', signed in with Auth0' : ' (Auth0 not configured — local dev account)'}.`
            : connection === 'connecting'
              ? 'Connecting to the Rove API…'
              : 'Offline — the API is unreachable, so this session uses bundled seed data and saves nothing.'}
        </T>
        <Touch onPress={signOut} style={{ padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface }}>
          <T s="med" size={14}>Sign out</T>
        </Touch>
      </View>
    </ScrollView>
  );
}
