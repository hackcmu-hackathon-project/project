import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadow } from '../theme';
import { Row, T, Touch } from './ui';

export type TabKey = 'feed' | 'list' | 'agent' | 'explore' | 'profile';

export function TabBar({
  tab,
  onTab,
  onAdd,
  bottom,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  onAdd: () => void;
  bottom: number;
}) {
  // Each label takes an equal share, so the pills sit at even intervals however
  // long the words are, and the round pair stays centred between them.
  const item = (key: TabKey, label: string) => {
    const on = tab === key;
    return (
      <View key={key} style={{ flex: 1, alignItems: 'center' }}>
        <Touch
          onPress={() => onTab(key)}
          label={label}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: radius.pill,
            backgroundColor: on ? colors.ink : 'transparent',
          }}
        >
          <T s="med" size={13} c={on ? '#fff' : colors.muted}>{label}</T>
        </Touch>
      </View>
    );
  };

  const circle = (glyph: string, label: string, onPress: () => void, size: number, active = false) => (
    <Touch
      onPress={onPress}
      label={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.plum,
        // Only the assistant has an on/off state; ＋ is always an action.
        borderWidth: active ? 2 : 0,
        borderColor: colors.ink,
      }}
    >
      <T size={size} c="#fff" style={{ lineHeight: size + 3 }}>{glyph}</T>
    </Touch>
  );

  return (
    <LinearGradient
      colors={['rgba(248,246,243,0)', colors.bg]}
      locations={[0, 0.3]}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: Math.max(bottom, 16),
      }}
    >
      <Row
        style={{
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
        <Row style={{ gap: 8, marginHorizontal: 2 }}>
          {circle('＋', 'Rank something', onAdd, 24)}
          {circle('✦', 'Ask the assistant', () => onTab('agent'), 19, tab === 'agent')}
        </Row>
        {item('explore', 'Explore')}
        {item('profile', 'You')}
      </Row>
    </LinearGradient>
  );
}
