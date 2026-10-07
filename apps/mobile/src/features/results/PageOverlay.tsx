import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { fitContain, type Size } from '@/features/capture/cropMath';
import { useAppTheme } from '@/theme';

import type { Mark } from './marks';

const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;

type Props = {
  imageUri: string;
  imageSize: Size;
  marks: Mark[];
  selectedId: string | null;
  onSelect: (mark: Mark) => void;
};

/**
 * The graded page with a mark over each flagged step: red with an ✕ badge for
 * mistakes, amber dashed with a ? badge for unreadable steps. Pinch or
 * double-tap to zoom, drag to pan, tap a mark for its explanation.
 */
export function PageOverlay({ imageUri, imageSize, marks, selectedId, onSelect }: Props) {
  const { colors } = useAppTheme();
  const [area, setArea] = useState<Size | null>(null);
  const display = area ? fitContain(imageSize, area) : null;

  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const w = display?.width ?? 0;
  const h = display?.height ?? 0;

  const clampTranslation = (s: number) => {
    'worklet';
    const maxX = (w * s - w) / 2;
    const maxY = (h * s - h) / 2;
    tx.value = Math.min(Math.max(tx.value, -maxX), maxX);
    ty.value = Math.min(Math.max(ty.value, -maxY), maxY);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(startScale.value * e.scale, 1), MAX_ZOOM);
      clampTranslation(scale.value);
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = startX.value + e.translationX;
      ty.value = startY.value + e.translationY;
      clampTranslation(scale.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomIn = scale.value < 1.5;
      scale.value = withTiming(zoomIn ? DOUBLE_TAP_ZOOM : 1);
      tx.value = withTiming(0);
      ty.value = withTiming(0);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setArea({ width, height });
  }

  return (
    <View style={[styles.area, { backgroundColor: colors.canvas }]} onLayout={onLayout}>
      {display ? (
        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ width: display.width, height: display.height }, zoomStyle]}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: display.width, height: display.height }}
              accessibilityLabel="Your graded page"
            />
            {marks.map((mark) => (
              <MarkView
                key={mark.id}
                mark={mark}
                display={display}
                selected={mark.id === selectedId}
                onPress={() => onSelect(mark)}
              />
            ))}
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

function MarkView({ mark, display, selected, onPress }: { mark: Mark; display: Size; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const incorrect = mark.status === 'incorrect';
  const color = incorrect ? colors.error : colors.unclear;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`${incorrect ? 'Mistake' : 'Unreadable step'} ${mark.number}, problem ${mark.problemLabel}: ${mark.concept}`}
      accessibilityHint="Shows the explanation"
      style={[
        styles.mark,
        {
          left: mark.bbox.x * display.width,
          top: mark.bbox.y * display.height,
          width: mark.bbox.w * display.width,
          height: mark.bbox.h * display.height,
          borderColor: color,
          borderStyle: incorrect ? 'solid' : 'dashed',
          borderWidth: selected ? 3.5 : 2,
          backgroundColor: incorrect ? colors.errorSoft : colors.unclearSoft,
        },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: color }]}>
        <Ionicons name={incorrect ? 'close' : 'help'} size={12} color="#FFFFFF" />
        <Text style={styles.badgeText}>{mark.number}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mark: {
    position: 'absolute',
    borderRadius: 4,
  },
  badge: {
    position: 'absolute',
    top: -11,
    left: -11,
    height: 22,
    minWidth: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
