import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors, radius } from '../theme';
import { Row, T, Touch } from './ui';
import { Connection } from '../store';

/**
 * Shown at the top of a tab when the API can't be reached. The app still works
 * from the bundled catalogue, but nothing is being saved, so say so plainly.
 */
export function OfflineBanner({ connection, onRetry }: { connection: Connection; onRetry: () => void }) {
  if (connection === 'online') return null;
  if (connection === 'connecting') {
    return (
      <Row style={{ gap: 8, marginHorizontal: 22, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.sunken }}>
        <ActivityIndicator size="small" color={colors.soft} />
        <T s="soft" size={12.5}>Connecting…</T>
      </Row>
    );
  }
  return (
    <Row style={{ gap: 10, marginHorizontal: 22, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.sunken }}>
      <View style={{ flex: 1 }}>
        <T s="med" size={13}>Can’t reach the Rove API</T>
        <T s="soft" size={12} style={{ marginTop: 2, lineHeight: 17 }}>
          Showing the built-in catalogue. Nothing you do here is being saved.
        </T>
      </View>
      <Touch onPress={onRetry} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.ink }}>
        <T s="med" size={12} c="#fff">Retry</T>
      </Touch>
    </Row>
  );
}
