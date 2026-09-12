import React from 'react';
import { colors, radius } from '../theme';
import { Row, T, Touch } from './ui';

/** Must match social.EMOJI on the server. */
export const EMOJI = ['🔥', '😍', '👏', '😂', '🤔', '😭'];

export function ReactionBar({
  counts,
  mine,
  onPick,
  size = 'md',
}: {
  counts: Record<string, number>;
  mine: string | null;
  onPick: (emoji: string) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <Row style={{ gap: 6, flexWrap: 'wrap' }}>
      {EMOJI.map((e) => {
        const n = counts[e] ?? 0;
        const on = mine === e;
        return (
          <Touch
            key={e}
            onPress={() => onPick(e)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: size === 'sm' ? 8 : 10,
              paddingVertical: size === 'sm' ? 5 : 7,
              borderRadius: radius.pill,
              backgroundColor: on ? colors.plum : colors.surface,
              borderWidth: 1,
              borderColor: on ? colors.plum : colors.line,
            }}
          >
            <T size={size === 'sm' ? 12 : 14}>{e}</T>
            {n > 0 ? <T s="med" size={12} c={on ? '#fff' : colors.soft}>{n}</T> : null}
          </Touch>
        );
      })}
    </Row>
  );
}
