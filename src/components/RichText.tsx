import React from 'react';
import { View } from 'react-native';
import { colors, font } from '../theme';
import { T, Touch } from './ui';

type Props = {
  text: string;
  /** Title → item id, so a place the assistant names becomes a link to it. */
  places: Record<string, number>;
  onOpenItem: (id: number) => void;
};

const BOLD = /\*\*(.+?)\*\*/g;

/**
 * The little bit of markdown a model actually emits: **bold** and "* " bullets.
 * A bold span that matches a catalogue title becomes a link to that place —
 * which is what the model is doing when it emphasises a name.
 */
export function RichText({ text, places, onOpenItem }: Props) {
  const lines = text.split('\n').filter((l) => l.trim().length);

  return (
    <View style={{ gap: 8 }}>
      {lines.map((raw, i) => {
        const bullet = /^\s*[*-]\s+/.test(raw);
        const line = bullet ? raw.replace(/^\s*[*-]\s+/, '') : raw;
        const body = (
          <T size={15} style={{ lineHeight: 22, flex: bullet ? 1 : undefined }}>
            {segments(line).map((seg, n) => {
              if (!seg.bold) return <T key={n} size={15} style={{ lineHeight: 22 }}>{seg.text}</T>;
              const id = places[seg.text.toLowerCase().replace(/[.,!?:;]+$/, '')];
              if (id === undefined) {
                return (
                  <T key={n} size={15} style={{ fontFamily: font.semi, lineHeight: 22 }}>{seg.text}</T>
                );
              }
              return (
                <T
                  key={n}
                  size={15}
                  onPress={() => onOpenItem(id)}
                  style={{ fontFamily: font.semi, color: colors.plum, lineHeight: 22 }}
                >
                  {seg.text}
                </T>
              );
            })}
          </T>
        );
        return bullet ? (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            <T size={15} c={colors.faint} style={{ lineHeight: 22 }}>·</T>
            {body}
          </View>
        ) : (
          <View key={i}>{body}</View>
        );
      })}
    </View>
  );
}

function segments(line: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  let last = 0;
  for (const match of line.matchAll(BOLD)) {
    if (match.index! > last) out.push({ text: line.slice(last, match.index), bold: false });
    out.push({ text: match[1], bold: true });
    last = match.index! + match[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}
