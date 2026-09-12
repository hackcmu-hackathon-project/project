import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors, radius } from '../theme';
import { Hatch, T, Touch } from '../components/ui';
import { useAuth } from '../auth';

export function SignIn() {
  const { signIn, signInAsGuest, loading, configured } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Hatch style={{ flex: 1 }} />
      <View style={{ padding: 28, paddingBottom: 44 }}>
        <T s="serif" size={52} style={{ lineHeight: 54 }}>Rove</T>
        <T s="soft" size={16} style={{ marginTop: 10, lineHeight: 23 }}>
          Rank the days you actually had. Compare two at a time, get a number that means
          something, and steal your friends’ itineraries.
        </T>
        <Touch
          onPress={signIn}
          style={{ marginTop: 26, padding: 17, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : null}
          <T s="med" size={15} c="#fff">{configured ? 'Continue with Auth0' : 'Continue'}</T>
        </Touch>
        {configured ? (
          <Touch onPress={signInAsGuest} style={{ padding: 14, alignItems: 'center' }}>
            <T s="soft" size={14}>Look around first</T>
          </Touch>
        ) : (
          <T s="soft" size={12} style={{ marginTop: 14, textAlign: 'center', color: colors.faint }}>
            Demo mode · set EXPO_PUBLIC_AUTH0_* to enable real sign-in
          </T>
        )}
      </View>
    </View>
  );
}
