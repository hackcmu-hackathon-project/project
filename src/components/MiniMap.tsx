import React from 'react';
import { Image, View } from 'react-native';
import { colors, radius } from '../theme';
import { T } from './ui';

const TILE = 256;

/** Slippy-map maths: where a point sits in world pixels at a zoom level. */
function project(lat: number, lon: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * A small OpenStreetMap view centred on a point, built from raw tiles — no map
 * library, no API key. It is for confirming that an address landed where you
 * meant, not for panning around.
 */
export function MiniMap({
  lat,
  lon,
  zoom = 15,
  height = 150,
  width,
}: {
  lat: number;
  lon: number;
  zoom?: number;
  height?: number;
  width: number;
}) {
  const centre = project(lat, lon, zoom);
  const left = centre.x - width / 2;
  const top = centre.y - height / 2;

  const tiles = [];
  for (let x = Math.floor(left / TILE); x <= Math.floor((left + width) / TILE); x++) {
    for (let y = Math.floor(top / TILE); y <= Math.floor((top + height) / TILE); y++) {
      tiles.push({ x, y, offsetX: x * TILE - left, offsetY: y * TILE - top });
    }
  }

  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: colors.sunken,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      {tiles.map((tile) => (
        <Image
          key={`${tile.x}-${tile.y}`}
          source={{ uri: `https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png` }}
          style={{ position: 'absolute', left: tile.offsetX, top: tile.offsetY, width: TILE, height: TILE }}
        />
      ))}

      {/* The pin sits dead centre, because that is what we centred on. */}
      <View
        style={{
          position: 'absolute',
          left: width / 2 - 9,
          top: height / 2 - 18,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.plum,
          borderWidth: 3,
          borderColor: '#fff',
        }}
      />

      <T
        size={9}
        style={{
          position: 'absolute',
          right: 4,
          bottom: 2,
          color: 'rgba(28,26,25,0.6)',
          backgroundColor: 'rgba(255,255,255,0.7)',
          paddingHorizontal: 3,
        }}
      >
        © OpenStreetMap
      </T>
    </View>
  );
}
