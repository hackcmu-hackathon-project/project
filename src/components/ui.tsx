import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, scoreColors, fmtScore } from '../theme';

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

type TProps = React.ComponentProps<typeof Text> & { s?: keyof typeof VARIANTS; c?: string; size?: number };

const VARIANTS = {
  serif: { fontFamily: font.serif, color: colors.ink, letterSpacing: -0.5 },
  body: { fontFamily: font.body, color: colors.ink },
  med: { fontFamily: font.med, color: colors.ink },
  semi: { fontFamily: font.semi, color: colors.ink },
  soft: { fontFamily: font.body, color: colors.soft },
  label: {
    fontFamily: font.semi,
    color: colors.faint,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
};

export function T({ s = 'body', c, size, style, children, ...rest }: TProps) {
  return (
    <Text {...rest} style={[VARIANTS[s], size ? { fontSize: size } : null, c ? { color: c } : null, style]}>
      {children}
    </Text>
  );
}

/** The hatched placeholder surface from the design, rendered with stripes. */
export function Hatch({
  style,
  dark,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  children?: React.ReactNode;
}) {
  const base = dark ? '#2a2624' : '#efeae4';
  const stripe = dark ? '#33302c' : '#e6e0d8';
  return (
    <View style={[{ backgroundColor: base, overflow: 'hidden' }, style]}>
      <View style={{ position: 'absolute', top: -700, left: -700, right: -700, bottom: -700, transform: [{ rotate: '-45deg' }] }}>
        {Array.from({ length: 340 }).map((_, i) => (
          <View key={i} style={{ height: 6, backgroundColor: i % 2 ? stripe : 'transparent' }} />
        ))}
      </View>
      {children}
    </View>
  );
}

/**
 * An item's photo, with the hatched placeholder underneath it. The placeholder
 * shows while the image loads, if it fails, and for items with no photo at all.
 */
export function Photo({
  uri,
  style,
  radius: r,
  children,
}: {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Hatch style={[{ borderRadius: r }, style]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {children}
    </Hatch>
  );
}

export function ScoreDot({ score, size = 40 }: { score: number | null; size?: number }) {
  const [bg, fg] = scoreColors(score);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semi, color: fg, fontSize: size * 0.34, letterSpacing: -0.3 }}>{fmtScore(score)}</Text>
    </View>
  );
}

export function Initials({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semi, color: '#fff', fontSize: size * 0.35 }}>{initials}</Text>
    </View>
  );
}

export function CityChips({ city, onChange }: { city: 'sf' | 'nyc'; onChange: (c: 'sf' | 'nyc') => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['sf', 'nyc'] as const).map((k) => {
        const on = city === k;
        return (
          <Pressable
            key={k}
            onPress={() => { tap(); onChange(k); }}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: on ? colors.ink : colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <T s="med" size={13} c={on ? '#fff' : colors.ink}>
              {k === 'sf' ? 'San Francisco' : 'New York'}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Eyebrow({ children, style }: any) {
  return <T s="label" style={[{ fontSize: 12 }, style]}>{children}</T>;
}

export function Row({ children, style }: any) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function PrimaryButton({ label, onPress, style, tone = 'ink' }: any) {
  const bg = tone === 'ink' ? colors.ink : tone === 'plum' ? colors.plum : colors.surface;
  const fg = tone === 'light' ? colors.ink : '#fff';
  return (
    <Pressable
      onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => [
        {
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: bg,
          alignItems: 'center',
          borderWidth: tone === 'light' ? 1 : 0,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <T s="med" size={15} c={fg}>{label}</T>
    </Pressable>
  );
}

export function Touch({ children, onPress, style, label, disabled }: any) {
  return (
    <Pressable
      onPress={() => { tap(); onPress?.(); }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [style, { opacity: pressed ? 0.65 : disabled ? 0.5 : 1 }]}
    >
      {children}
    </Pressable>
  );
}
