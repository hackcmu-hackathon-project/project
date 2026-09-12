import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme';
import { Hatch, T } from './ui';

export type PlacePhoto = { url: string; credit: string; source: string; by: string | null };

const ADVANCE_MS = 4500;

/**
 * The place's pictures: its cover first, then photos people attached to their
 * own rankings. Advances on its own, and stops the moment you touch it — an
 * animation that fights your finger is worse than no animation.
 */
export function PhotoCarousel({
  photos,
  height,
  label,
  children,
}: {
  photos: PlacePhoto[];
  height: number;
  label?: string;
  children?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const frame = Math.min(width, 520);
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || photos.length < 2) return;
    const timer = setTimeout(() => {
      const next = (index + 1) % photos.length;
      setIndex(next);
      scroller.current?.scrollTo({ x: next * frame, animated: true });
    }, ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [index, held, photos.length, frame]);

  if (!photos.length) {
    return (
      <Hatch style={{ height, justifyContent: 'flex-end' }}>
        {label ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <T s="serif" size={40} c="rgba(28,26,25,0.22)">{label.trim().charAt(0).toUpperCase()}</T>
          </View>
        ) : null}
        {children}
      </Hatch>
    );
  }

  return (
    <View style={{ height }}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onTouchStart={() => setHeld(true)}
        onScrollEndDrag={(e) => {
          setIndex(Math.round(e.nativeEvent.contentOffset.x / frame));
          setHeld(false);
        }}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / frame))}
        style={{ height }}
      >
        {photos.map((photo, i) => (
          <Image
            key={`${photo.url}-${i}`}
            source={{ uri: photo.url }}
            resizeMode="cover"
            style={{ width: frame, height }}
          />
        ))}
      </ScrollView>

      {photos.length > 1 ? (
        <View
          style={{
            position: 'absolute',
            bottom: 12,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {photos.map((photo, i) => (
            <View
              key={`${photo.url}-dot-${i}`}
              style={{
                width: i === index ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? '#fff' : 'rgba(255,255,255,0.55)',
              }}
            />
          ))}
        </View>
      ) : null}

      {children}
    </View>
  );
}
