import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { colors, font, radius } from '../theme';
import { CityKey } from '../data';
import { Me, Person, api } from '../api';
import { Eyebrow, Initials, Row, T, Touch } from '../components/ui';
import { useStore } from '../store';
import { useAuth } from '../auth';

/** Reads someone's taste off what they've actually ranked. */
function taste(ranked: { category: string; hood: string; price: number; tags: string[] }[]) {
  if (ranked.length < 3) return [];
  const tally = (key: 'category' | 'hood') =>
    Object.entries(
      ranked.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] ?? 0) + 1 }), {})
    ).sort((a, b) => b[1] - a[1]);

  const out: string[] = [];
  const cats = tally('category');
  out.push(...cats.slice(0, 2).map(([c]) => `${c}-led`));
  const hood = tally('hood')[0];
  if (hood && hood[1] > 1) out.push(`Keeps going back to ${hood[0]}`);
  const free = ranked.filter((r) => r.price === 0).length / ranked.length;
  if (free > 0.5) out.push('Mostly free things');
  const tags = ranked.flatMap((r) => r.tags);
  if (tags.filter((t) => t === 'sunrise' || t === 'morning').length > 1) out.push('Early mornings');
  if (tags.filter((t) => t === 'walk' || t === 'hike').length > 1) out.push('Long walks');
  return out.slice(0, 5);
}

export function Profile({
  top,
  onOpenCity,
  onFindPeople,
  onOpenPerson,
}: {
  top: number;
  onOpenCity: (c: CityKey) => void;
  onFindPeople: () => void;
  onOpenPerson: (sub: string) => void;
}) {
  const { ranked, connection, me: storeMe } = useStore();
  const { user, token, signOut, configured } = useAuth();
  const [me, setMe] = useState<Me | null>(storeMe);
  const [following, setFollowing] = useState<Person[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', handle: '', bio: '' });
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const beginEdit = () => {
    setDraft({ name: me?.name ?? '', handle: me?.handle ?? '', bio: me?.bio ?? '' });
    setSaveError(null);
    setEditing(true);
  };

  const saveProfile = async () => {
    try {
      await api.updateMe(token, {
        name: draft.name.trim() || undefined,
        handle: draft.handle.trim().replace(/^@/, '') || undefined,
        bio: draft.bio.trim(),
      });
      setEditing(false);
      load();
    } catch (e: any) {
      setSaveError(String(e?.message ?? e).includes('409') ? 'That handle is taken.' : 'Could not save that.');
    }
  };

  const sf = ranked('sf');
  const nyc = ranked('nyc');
  const myTaste = taste([...sf, ...nyc]);
  const name = me?.name ?? user?.name ?? 'Traveler';

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24 }}>
        <Initials name={name} color={colors.plum} size={76} />
        {editing ? (
          <View style={{ width: '100%', marginTop: 16, gap: 10 }}>
            {(['name', 'handle', 'bio'] as const).map((key) => (
              <View
                key={key}
                style={{ paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
              >
                <TextInput
                  value={draft[key]}
                  onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                  autoCapitalize={key === 'handle' ? 'none' : 'sentences'}
                  placeholder={key === 'name' ? 'Your name' : key === 'handle' ? 'handle' : 'A line about how you travel'}
                  placeholderTextColor={colors.faint}
                  style={{ paddingVertical: 12, fontFamily: font.body, fontSize: 15, color: colors.ink, outlineStyle: 'none' } as any}
                />
              </View>
            ))}
            {saveError ? <T s="soft" size={12.5} c={colors.plum}>{saveError}</T> : null}
            <Row style={{ gap: 10 }}>
              <Touch onPress={saveProfile} style={{ flex: 1, padding: 13, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}>
                <T s="med" size={14} c="#fff">Save</T>
              </Touch>
              <Touch onPress={() => setEditing(false)} style={{ flex: 1, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                <T s="med" size={14}>Cancel</T>
              </Touch>
            </Row>
          </View>
        ) : (
          <>
            <T s="serif" size={30} style={{ marginTop: 12 }}>{name}</T>
            <T s="soft" size={13} style={{ marginTop: 2 }}>
              {me?.handle ? `@${me.handle}` : user?.email ?? '@you'}
            </T>
            {me?.bio ? (
              <T s="soft" size={13.5} style={{ marginTop: 8, textAlign: 'center', lineHeight: 20 }}>{me.bio}</T>
            ) : null}
            {connection === 'online' ? (
              <Touch onPress={beginEdit} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                <T s="med" size={13}>Edit profile</T>
              </Touch>
            ) : null}
          </>
        )}
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
            <Touch
              key={p.sub}
              onPress={() => onOpenPerson(p.sub)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
            >
              <Initials name={p.name} color={p.color} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T s="med" size={14}>{p.name}</T>
                <T s="soft" size={12} style={{ marginTop: 2 }}>@{p.handle} · {p.ranked} ranked</T>
              </View>
              <T c={colors.faint} size={16}>›</T>
            </Touch>
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
      {myTaste.length ? (
        <Row style={{ flexWrap: 'wrap', gap: 8, paddingHorizontal: 22 }}>
          {myTaste.map((t) => (
            <View key={t} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.sunken }}>
              <T size={13}>{t}</T>
            </View>
          ))}
        </Row>
      ) : (
        <T s="soft" size={13} style={{ paddingHorizontal: 22, lineHeight: 20 }}>
          Rank a few more things and this fills in with what you actually go for.
        </T>
      )}

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
