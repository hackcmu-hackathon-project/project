import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadow } from '../theme';
import { Row, T, Touch } from './ui';

export type TabKey = 'feed' | 'list' | 'agent' | 'explore' | 'profile';

export function TabBar({ tab, onTab, onAdd, bottom }: { tab: TabKey; onTab: (t: TabKey) => void; onAdd: () => void; bottom: number }) {
  const item = (key: TabKey, label: string) => {
    const on = tab === key;
    return (
      <Touch
        key={key}
        onPress={() => onTab(key)}
        label={label}
        style={{ paddingHorizontal: 13, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: on ? colors.ink : 'transparent' }}
      >
        <T s="med" size={13} c={on ? '#fff' : colors.muted}>{label}</T>
      </Touch>
    );
  };

  /** The two round actions in the middle: rank something, and ask the assistant. */
  const circle = (glyph: string, label: string, onPress: () => void, filled: boolean, size = 22) => (
    <Touch
      onPress={onPress}
      label={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        marginVertical: -2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? colors.plum : colors.plumSoft,
      }}
    >
      <T size={size} c={filled ? '#fff' : colors.plum} style={{ lineHeight: size + 3 }}>{glyph}</T>
    </Touch>
  );

  return (
    <LinearGradient
      colors={['rgba(248,246,243,0)', colors.bg]}
      locations={[0, 0.3]}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 18, paddingBottom: Math.max(bottom, 16) }}
    >
      <Row
        style={{
          justifyContent: 'space-between',
          paddingHorizontal: 6,
          paddingVertical: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
          ...shadow.tab,
        }}
      >
        {item('feed', 'Feed')}
        {item('list', 'Lists')}
        <Row style={{ gap: 6 }}>
          {circle('＋', 'Rank something', onAdd, true, 24)}
          {circle('✦', 'Ask the assistant', () => onTab('agent'), tab === 'agent', 19)}
        </Row>
        {item('explore', 'Explore')}
        {item('profile', 'You')}
      </Row>
    </LinearGradient>
  );
}
