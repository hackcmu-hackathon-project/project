import React from 'react';
import { View } from 'react-native';
import { API_URL } from '../config';
import { colors, radius } from '../theme';

/**
 * An interactive OpenStreetMap view, served as a Leaflet page from our own API
 * and embedded here. Drag the pin (or tap the map) to correct where a search
 * landed; `onMove` receives the new point.
 *
 * Native uses a WebView; the .web.tsx alongside this uses an iframe.
 */
export function MiniMap({
  lat,
  lon,
  height = 170,
  draggable = false,
  onMove,
}: {
  lat: number;
  lon: number;
  height?: number;
  draggable?: boolean;
  onMove?: (point: { lat: number; lon: number }) => void;
}) {
  const { WebView } = require('react-native-webview');
  const uri = `${API_URL}/map?lat=${lat}&lon=${lon}&draggable=${draggable ? 'true' : 'false'}`;

  return (
    <View
      style={{
        height,
        borderRadius: radius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.sunken,
      }}
    >
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={(event: { nativeEvent: { data: string } }) => {
          try {
            onMove?.(JSON.parse(event.nativeEvent.data));
          } catch {
            /* a malformed message is not worth a crash */
          }
        }}
      />
    </View>
  );
}
