import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { colors, font, radius, fmtScore, scoreColors } from '../theme';
import { CITIES, meta } from '../data';
import { Activity as ActivityData, api, toItem, absolute } from '../api';
import { Eyebrow, Initials, Photo, Row, T, Touch } from '../components/ui';
import { ReactionBar } from '../components/Reactions';
import { useAuth } from '../auth';
import { useStore } from '../store';

/** One person's ranking, with its reactions and comment thread. */
export function Activity({
  owner,
  itemId,
  top,
  onClose,
  onOpenItem,
  onOpenPerson,
}: {
  owner: string;
  itemId: number;
  top: number;
  onClose: () => void;
  onOpenItem: (id: number) => void;
  onOpenPerson: (sub: string) => void;
}) {
  const { token } = useAuth();
  const { refresh, toggleSave, isSaved, myScore } = useStore();
  const [data, setData] = useState<ActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.activity(token, owner, itemId));
    } catch {
      setError('That ranking is no longer there.');
    }
  }, [token, owner, itemId]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = async (emoji: string) => {
    if (!data) return;
    const clearing = data.my_reaction === emoji;
    const counts = { ...data.reactions };
    if (data.my_reaction) counts[data.my_reaction] = Math.max(0, (counts[data.my_reaction] ?? 1) - 1);
    if (!clearing) counts[emoji] = (counts[emoji] ?? 0) + 1;
    setData({ ...data, reactions: counts, my_reaction: clearing ? null : emoji });
    try {
      if (clearing) await api.unreact(token, owner, itemId);
      else await api.react(token, owner, itemId, emoji);
      refresh();
    } catch {
      load();
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !data) return;
    setSending(true);
    setText('');
    try {
      const comment = await api.comment(token, owner, itemId, body);
      setData((d) => (d ? { ...d, comments: [...d.comments, comment] } : d));
      refresh();
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    setData((d) => (d ? { ...d, comments: d.comments.filter((c) => c.id !== id) } : d));
    try {
      await api.deleteComment(token, id);
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

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.plum} />
      </View>
    );
  }

  const item = toItem(data.item);
  const [bg, fg] = scoreColors(data.score);
  const saved = isSaved(item.id);
  const mine = myScore(item.id);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <Row style={{ paddingHorizontal: 22, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14 }}>
        <T s="serif" size={30}>The take</T>
        <Touch onPress={onClose}><T s="soft" size={14}>Done</T></Touch>
      </Row>

      <Row style={{ gap: 10, paddingHorizontal: 22 }}>
        <Touch onPress={() => onOpenPerson(data.owner_sub)}>
          <Initials name={data.owner_name} color={data.owner_color} size={38} />
        </Touch>
        <Touch onPress={() => onOpenPerson(data.owner_sub)} style={{ flex: 1 }}>
          <T s="semi" size={15}>{data.owner_name}</T>
          <T s="soft" size={12} style={{ marginTop: 2 }}>
            @{data.owner_handle} · {data.when}
          </T>
        </Touch>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <T s="semi" size={15} c={fg}>{fmtScore(data.score)}</T>
        </View>
      </Row>

      <Touch onPress={() => onOpenItem(item.id)} style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <Photo uri={item.photo} label={item.title} radius={radius.lg} style={{ height: 190 }} />
        <T s="serif" size={24} style={{ marginTop: 12, lineHeight: 27 }}>{item.title}</T>
        <T s="soft" size={12.5} style={{ marginTop: 4 }}>
          {CITIES[item.city]} · {meta(item)}
        </T>
        {data.rank ? (
          <T s="soft" size={12.5} style={{ marginTop: 6, color: colors.plum }}>
            {data.owner_name}’s #{data.rank} of {data.total} in {CITIES[item.city]}
          </T>
        ) : null}
      </Touch>

      {data.photo_urls?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 22, gap: 10 }}>
          {data.photo_urls.map((uri, i) => <Photo key={uri} uri={absolute(uri)} label={`Memory ${i + 1}`} radius={12} style={{ width: 240, height: 200 }} />)}
        </ScrollView>
      ) : null}
      {data.note ? (
        <T size={15} c={colors.ink2} style={{ paddingHorizontal: 22, paddingTop: 14, lineHeight: 22 }}>
          “{data.note}”
        </T>
      ) : null}

      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <ReactionBar counts={data.reactions} mine={data.my_reaction} onPick={pick} />
      </View>

      <Row style={{ paddingHorizontal: 22, paddingTop: 14, gap: 10 }}>
        {mine != null ? (
          <Touch
            onPress={() => onOpenItem(item.id)}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.sunken }}
          >
            <T s="med" size={13} c={colors.muted}>You ranked it {mine.toFixed(1)}</T>
          </Touch>
        ) : (
          <Touch
            onPress={() => toggleSave(item.id)}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: saved ? colors.sunken : colors.ink }}
          >
            <T s="med" size={13} c={saved ? colors.muted : '#fff'}>{saved ? '✓ On your want-to-go' : 'Want to go'}</T>
          </Touch>
        )}
      </Row>

      <Eyebrow style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 8 }}>
        {data.comments.length ? `${data.comments.length} comment${data.comments.length === 1 ? '' : 's'}` : 'Comments'}
      </Eyebrow>

      {data.comments.length === 0 ? (
        <T s="soft" size={13.5} style={{ paddingHorizontal: 22, paddingBottom: 6 }}>
          Nothing yet. Ask them something.
        </T>
      ) : (
        data.comments.map((c) => (
          <Row key={c.id} style={{ gap: 10, paddingHorizontal: 22, paddingVertical: 10, alignItems: 'flex-start' }}>
            <Touch onPress={() => onOpenPerson(c.author_sub)}>
              <Initials name={c.author_name} color={c.author_color} size={30} />
            </Touch>
            <View style={{ flex: 1 }}>
              <T s="semi" size={13.5}>{c.author_name}</T>
              <T size={14} c={colors.ink2} style={{ marginTop: 3, lineHeight: 20 }}>{c.text}</T>
              {c.mine ? (
                <Touch onPress={() => remove(c.id)} style={{ paddingTop: 6 }}>
                  <T s="soft" size={12} c={colors.faint}>Delete</T>
                </Touch>
              ) : null}
            </View>
          </Row>
        ))
      )}

      <Row style={{ paddingHorizontal: 22, paddingTop: 14, gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
            placeholder="Add a comment…"
            placeholderTextColor={colors.faint}
            style={{ paddingVertical: 12, fontFamily: font.body, fontSize: 14, color: colors.ink, outlineStyle: 'none' } as any}
          />
        </View>
        <Touch
          onPress={send}
          style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: text.trim() ? colors.ink : colors.chip }}
        >
          <T s="med" size={13} c={text.trim() ? '#fff' : colors.faint}>{sending ? '…' : 'Post'}</T>
        </Touch>
      </Row>
    </ScrollView>
  );
}
