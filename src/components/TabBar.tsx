import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadow } from '../theme';
import { Row, T, Touch } from './ui';

export type TabKey = 'feed' | 'list' | 'agent' | 'explore' | 'profile';

export function TabBar({ tab, onTab, onAdd, bottom }: { tab: TabKey; onTab: (t: TabKey) => void; onAdd: () => void; bottom: number }) {
  const item = (key: TabKey, label: string, accent = false) => {
    const on = tab === key;
    const background = on ? (accent ? colors.plum : colors.ink) : 'transparent';
    return (
      <Touch
        key={key}
        onPress={() => onTab(key)}
        label={label}
        style={{ paddingHorizontal: 11, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: background }}
      >
        <T s="med" size={12.5} c={on ? '#fff' : accent ? colors.plum : colors.muted}>{label}</T>
      </Touch>
    );
  };

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
        <Touch
          onPress={onAdd}
          label="Rank something"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.plum, alignItems: 'center', justifyContent: 'center', marginVertical: -2 }}
        >
          <T size={24} c="#fff" style={{ lineHeight: 27 }}>＋</T>
        </Touch>
        {item('agent', 'Ask', true)}
        {item('explore', 'Explore')}
        {item('profile', 'You')}
      </Row>
    </LinearGradient>
  );
}
