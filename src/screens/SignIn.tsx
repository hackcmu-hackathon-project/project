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
      <View style={{ padding: 28, paddingBottom: 40 }}>
        <T s="serif" size={52} style={{ lineHeight: 54 }}>Rove</T>
        <T s="soft" size={16} style={{ marginTop: 10, lineHeight: 23 }}>
          Rank the things you actually did in San Francisco and New York. Compare two at a
          time, get a number that means something, follow the people whose taste you trust.
        </T>

        {configured ? (
          <>
            <Touch
              onPress={() => signIn('signup')}
              style={{ marginTop: 26, padding: 17, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
            >
              {loading ? <ActivityIndicator color="#fff" /> : null}
              <T s="med" size={15} c="#fff">Create an account</T>
            </Touch>
            <Touch
              onPress={() => signIn('login')}
              style={{ marginTop: 10, padding: 17, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
            >
              <T s="med" size={15}>I already have one</T>
            </Touch>
            <T s="soft" size={12} style={{ marginTop: 14, textAlign: 'center', color: colors.faint }}>
              Email, Google or Apple — handled by Auth0
            </T>
          </>
        ) : (
          <>
            <Touch
              onPress={() => signInAsGuest()}
              style={{ marginTop: 26, padding: 17, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center' }}
            >
              <T s="med" size={15} c="#fff">Continue as local dev</T>
            </Touch>
            <View style={{ marginTop: 16, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
              <T s="semi" size={13}>Auth0 isn’t configured yet</T>
              <T s="soft" size={12.5} style={{ marginTop: 6, lineHeight: 19 }}>
                Put your tenant’s domain and client ID in{' '}
                <T s="semi" size={12.5}>.env</T> as EXPO_PUBLIC_AUTH0_DOMAIN and
                EXPO_PUBLIC_AUTH0_CLIENT_ID, set AUTH0_DOMAIN in backend/.env, and real
                sign-up appears here. Until then everything runs as one local dev account.
              </T>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
