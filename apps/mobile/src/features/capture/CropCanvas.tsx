import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { dragEdges, edgesToNormalized, normalizedToEdges, type CropHandle, type Edges, type NormalizedRect } from './cropMath';

/** Smallest crop frame, in display points. */
const MIN_CROP_SIZE = 56;
/** Touch target around each handle (platform minimum is 44–48pt). */
const HANDLE_HIT = 48;
/**
 * Margin around the image. Handles sit on the image edge and overhang it by
 * half their size, and touches outside a parent view's bounds don't register,
 * so the canvas reserves room for them.
 */
export const CROP_CANVAS_PADDING = HANDLE_HIT / 2;
const PAD = CROP_CANVAS_PADDING;
const CORNER_DOT = 20;

const CORNERS: CropHandle[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const SIDES: CropHandle[] = ['top', 'bottom', 'left', 'right'];

type Props = {
  uri: string;
  /** Displayed image size in points (the canvas adds CROP_CANVAS_PADDING on every side). */
  width: number;
  height: number;
  /** Starting crop. Remount the component (via `key`) to reset it. */
  initialRect: NormalizedRect;
  /** Called with the new crop when a drag ends. */
  onChange: (rect: NormalizedRect) => void;
};

/**
 * An image with a draggable crop frame: four corner handles, four edge
 * handles, and the frame body to move the whole selection. Dragging runs on
 * the UI thread; the parent only hears about the final position.
 */
export function CropCanvas({ uri, width, height, initialRect, onChange }: Props) {
  const edges = useSharedValue<Edges>(normalizedToEdges(initialRect, { width, height }));
  const dragStart = useSharedValue<Edges>(edges.value);

  const gestures = useMemo(() => {
    const bounds = { width, height };
    const make = (handle: CropHandle) =>
      Gesture.Pan()
        .minDistance(0)
        .onStart(() => {
          dragStart.value = edges.value;
        })
        .onUpdate((event) => {
          edges.value = dragEdges(dragStart.value, handle, event.translationX, event.translationY, bounds, MIN_CROP_SIZE);
        })
        .onEnd(() => {
          scheduleOnRN(onChange, edgesToNormalized(edges.value, bounds));
        });

    return Object.fromEntries(
      (['move', ...CORNERS, ...SIDES] as CropHandle[]).map((handle) => [handle, make(handle)]),
    ) as Record<CropHandle, ReturnType<typeof make>>;
  }, [width, height, onChange, edges, dragStart]);

  const frameStyle = useAnimatedStyle(() => ({
    left: PAD + edges.value.left,
    top: PAD + edges.value.top,
    width: edges.value.right - edges.value.left,
    height: edges.value.bottom - edges.value.top,
  }));

  // Four bands that dim the image outside the frame.
  const scrimTop = useAnimatedStyle(() => ({ left: PAD, top: PAD, width, height: edges.value.top }));
  const scrimBottom = useAnimatedStyle(() => ({
    left: PAD,
    top: PAD + edges.value.bottom,
    width,
    height: height - edges.value.bottom,
  }));
  const scrimLeft = useAnimatedStyle(() => ({
    left: PAD,
    top: PAD + edges.value.top,
    width: edges.value.left,
    height: edges.value.bottom - edges.value.top,
  }));
  const scrimRight = useAnimatedStyle(() => ({
    left: PAD + edges.value.right,
    top: PAD + edges.value.top,
    width: width - edges.value.right,
    height: edges.value.bottom - edges.value.top,
  }));

  return (
    <View
      style={{ width: width + PAD * 2, height: height + PAD * 2 }}
      accessibilityLabel="Page photo with crop frame"
      accessibilityHint="Drag the corners or edges of the frame to crop. Use Reset to start over."
    >
      <Image source={{ uri }} style={[styles.image, { width, height }]} resizeMode="stretch" />

      {[scrimTop, scrimBottom, scrimLeft, scrimRight].map((style, index) => (
        <Animated.View key={index} pointerEvents="none" style={[styles.scrim, style]} />
      ))}

      <GestureDetector gesture={gestures.move}>
        <Animated.View style={[styles.frame, frameStyle]}>
          <View pointerEvents="none" style={styles.thirdsVertical} />
          <View pointerEvents="none" style={styles.thirdsHorizontal} />
        </Animated.View>
      </GestureDetector>

      {SIDES.map((handle) => (
        <Handle key={handle} handle={handle} edges={edges} gesture={gestures[handle]} />
      ))}
      {CORNERS.map((handle) => (
        <Handle key={handle} handle={handle} edges={edges} gesture={gestures[handle]} />
      ))}
    </View>
  );
}

type HandleProps = {
  handle: CropHandle;
  edges: SharedValue<Edges>;
  gesture: ReturnType<typeof Gesture.Pan>;
};

/** A touch target centered on a frame corner or edge midpoint. */
function Handle({ handle, edges, gesture }: HandleProps) {
  const isCorner = CORNERS.includes(handle);
  const isHorizontalBar = handle === 'top' || handle === 'bottom';

  const style = useAnimatedStyle(() => {
    const { left, top, right, bottom } = edges.value;
    const x =
      handle === 'left' || handle === 'topLeft' || handle === 'bottomLeft'
        ? left
        : handle === 'right' || handle === 'topRight' || handle === 'bottomRight'
          ? right
          : (left + right) / 2;
    const y =
      handle === 'top' || handle === 'topLeft' || handle === 'topRight'
        ? top
        : handle === 'bottom' || handle === 'bottomLeft' || handle === 'bottomRight'
          ? bottom
          : (top + bottom) / 2;
    // The canvas padding equals half the hit size, so these cancel out.
    return { left: x, top: y };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.handleHit, style]}>
        <View style={isCorner ? styles.cornerDot : isHorizontalBar ? styles.barHorizontal : styles.barVertical} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    position: 'absolute',
    left: PAD,
    top: PAD,
  },
  scrim: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  frame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  // Rule-of-thirds guides help line up a single problem.
  thirdsVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: '33.34%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  thirdsHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: '33.34%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  handleHit: {
    position: 'absolute',
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerDot: {
    width: CORNER_DOT,
    height: CORNER_DOT,
    borderRadius: CORNER_DOT / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.35)',
  },
  barHorizontal: {
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  barVertical: {
    width: 6,
    height: 28,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
});
