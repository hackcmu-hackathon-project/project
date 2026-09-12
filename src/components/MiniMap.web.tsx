import React, { useEffect } from 'react';
import { View } from 'react-native';
import { API_URL } from '../config';
import { colors, radius } from '../theme';

/** The web half of MiniMap: the same Leaflet page, in an iframe. */
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
  useEffect(() => {
    if (!onMove) return;
    const listen = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const point = JSON.parse(event.data);
        if (typeof point?.lat === 'number' && typeof point?.lon === 'number') onMove(point);
      } catch {
        /* other postMessage traffic on the page is not ours */
      }
    };
    globalThis.addEventListener?.('message', listen);
    return () => globalThis.removeEventListener?.('message', listen);
  }, [onMove]);

  const src = `${API_URL}/map?lat=${lat}&lon=${lon}&draggable=${draggable ? 'true' : 'false'}`;

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
      {React.createElement('iframe', {
        src,
        style: { border: 0, width: '100%', height: '100%' },
        title: 'Map',
        loading: 'lazy',
      })}
    </View>
  );
}
