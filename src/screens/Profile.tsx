import React from 'react';
import { ScrollView, View } from 'react-native';
import { colors, radius } from '../theme';
import { CityKey } from '../data';
import { Eyebrow, Initials, Row, T, Touch } from '../components/ui';
import { useStore } from '../store';
import { useAuth } from '../auth';

const TASTE = ['Early mornings', 'Long walks', 'Food-led', 'Skips the famous stuff'];

export function Profile({ top, onOpenCity }: { top: number; onOpenCity: (c: CityKey) => void }) {
  const { ranked } = useStore();
  const { user, signOut, configured } = useAuth();
  const sf = ranked('sf');
  const nyc = ranked('nyc');
  const name = user?.name ?? 'Traveler';

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24 }}>
        <Initials name={name} color={colors.plum} size={76} />
        <T s="serif" size={30} style={{ marginTop: 12 }}>{name}</T>
        <T s="soft" size={13} style={{ marginTop: 2 }}>
          {user?.email ?? '@you'} · SF based, NYC often
        </T>
      </View>

      <Row style={{ justifyContent: 'center', gap: 36, paddingBottom: 26 }}>
        {[
          [String(sf.length + nyc.length), 'Ranked'],
          ['2', 'Cities'],
          ['48', 'Friends'],
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
                {list.length} ranked · top: {list[0]?.hood ?? '–'}
              </T>
            </View>
            <T c={colors.faint} size={16}>›</T>
          </Touch>
        ))}
      </View>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10 }}>Taste</Eyebrow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 22 }}>
        {TASTE.map((t) => (
          <View key={t} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.sunken }}>
            <T size={13}>{t}</T>
          </View>
        ))}
      </View>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 10 }}>Account</Eyebrow>
      <View style={{ paddingHorizontal: 22 }}>
        <T s="soft" size={12} style={{ marginBottom: 10 }}>
          {configured ? 'Signed in with Auth0. Rankings sync to MongoDB.' : 'Demo mode — Auth0 and the API are not configured, so nothing is saved.'}
        </T>
        <Touch onPress={signOut} style={{ padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface }}>
          <T s="med" size={14}>Sign out</T>
        </Touch>
      </View>
    </ScrollView>
  );
}
