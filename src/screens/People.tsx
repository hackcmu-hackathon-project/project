import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { colors, font, radius } from '../theme';
import { Person, api } from '../api';
import { Eyebrow, Initials, Row, T, Touch } from '../components/ui';
import { useAuth } from '../auth';

type Tab = 'discover' | 'following';

export function People({ top, onClose }: { top: number; onClose: () => void }) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('discover');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(tab === 'following' ? await api.following(token) : await api.people(token, q));
    } catch (e: any) {
      setError('Could not reach the Rove API.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, q, token]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const toggle = async (p: Person) => {
    // Optimistic: the row flips immediately, the server catches up.
    setRows((prev) =>
      prev.map((r) =>
        r.sub === p.sub ? { ...r, following: !r.following, followers: r.followers + (r.following ? -1 : 1) } : r
      )
    );
    try {
      if (p.following) await api.unfollow(token, p.sub);
      else await api.follow(token, p.sub);
    } catch {
      load();
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <Row style={{ paddingHorizontal: 22, justifyContent: 'space-between', alignItems: 'center' }}>
        <T s="serif" size={36}>People</T>
        <Touch onPress={onClose}><T s="soft" size={14}>Done</T></Touch>
      </Row>

      <Row style={{ gap: 8, paddingHorizontal: 22, paddingTop: 12 }}>
        {(['discover', 'following'] as Tab[]).map((t) => (
          <Touch
            key={t}
            onPress={() => setTab(t)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: tab === t ? colors.ink : colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <T s="med" size={13} c={tab === t ? '#fff' : colors.ink}>{t === 'discover' ? 'Find people' : 'Following'}</T>
          </Touch>
        ))}
      </Row>

      {tab === 'discover' ? (
        <View style={{ marginHorizontal: 22, marginTop: 16, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            placeholder="Search by name or @handle"
            placeholderTextColor={colors.faint}
            style={{ paddingVertical: 12, fontFamily: font.body, fontSize: 15, color: colors.ink, outlineStyle: 'none' } as any}
          />
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.plum} style={{ marginTop: 40 }} />
      ) : error ? (
        <T s="soft" size={14} style={{ padding: 22 }}>{error}</T>
      ) : rows.length === 0 ? (
        <T s="soft" size={14} style={{ padding: 22, lineHeight: 21 }}>
          {tab === 'following'
            ? 'You’re not following anyone yet. Find people and your feed fills up.'
            : q
              ? `Nobody matches “${q}”.`
              : 'No one else has signed up yet.'}
        </T>
      ) : (
        <>
          <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 4 }}>
            {tab === 'following' ? `${rows.length} following` : q ? 'Results' : 'Suggested'}
          </Eyebrow>
          {rows.map((p) => (
            <Row key={p.sub} style={{ gap: 12, paddingHorizontal: 22, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#ebe6df' }}>
              <Initials name={p.name} color={p.color} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T s="med" size={15}>{p.name}</T>
                <T s="soft" size={12} style={{ marginTop: 2 }}>
                  @{p.handle} · {p.ranked} ranked · {p.followers} follower{p.followers === 1 ? '' : 's'}
                </T>
                {p.top_pick ? (
                  <T s="soft" size={12} numberOfLines={1} style={{ marginTop: 3, color: colors.faint }}>
                    Top pick: {p.top_pick}
                  </T>
                ) : null}
              </View>
              <Touch
                onPress={() => toggle(p)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: p.following ? colors.surface : colors.ink,
                  borderWidth: 1,
                  borderColor: p.following ? colors.border : colors.ink,
                }}
              >
                <T s="med" size={13} c={p.following ? colors.muted : '#fff'}>{p.following ? 'Following' : 'Follow'}</T>
              </Touch>
            </Row>
          ))}
        </>
      )}
    </ScrollView>
  );
}
