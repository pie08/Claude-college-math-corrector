import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CROP_CANVAS_PADDING, CropCanvas } from '@/features/capture/CropCanvas';
import {
  FULL_RECT,
  fitContain,
  normalizeQuarterTurns,
  rotateRectClockwise,
  type NormalizedRect,
  type QuarterTurns,
  type Size,
} from '@/features/capture/cropMath';
import { exportCrop, preparePreview, rotatePreview, type ImageInfo } from '@/features/capture/imageProcessing';
import { spacing, useAppTheme } from '@/theme';

type Loaded = {
  /** Full-resolution original; only touched again at export. */
  source: ImageInfo;
  /** Small unrotated preview, the base for rotated previews. */
  basePreview: ImageInfo;
  /** Preview currently on screen (basePreview rotated by `turns`). */
  preview: ImageInfo;
  turns: QuarterTurns;
};

export default function CropScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [rect, setRect] = useState<NormalizedRect>(FULL_RECT);
  // Bumped to remount the crop frame at the current `rect` (after reset).
  const [frameVersion, setFrameVersion] = useState(0);
  const [canvasSize, setCanvasSize] = useState<Size | null>(null);
  const [busy, setBusy] = useState<'rotating' | 'exporting' | null>(null);

  useEffect(() => {
    let cancelled = false;
    preparePreview(uri)
      .then(({ source, preview }) => {
        if (!cancelled) setLoaded({ source, basePreview: preview, preview, turns: 0 });
      })
      .catch(() => {
        if (cancelled) return;
        Alert.alert("Couldn't open that image", 'Try taking the photo again.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const onCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  }, []);

  async function rotate(direction: 1 | -1) {
    if (!loaded) return;
    setBusy('rotating');
    try {
      const turns = normalizeQuarterTurns(loaded.turns + direction);
      const preview = await rotatePreview(loaded.basePreview, turns);
      // Keep the user's crop on the same part of the page.
      setRect((current) => rotateRectClockwise(current, direction));
      setLoaded({ ...loaded, preview, turns });
    } catch {
      Alert.alert("Couldn't rotate the image", 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setRect(FULL_RECT);
    setFrameVersion((version) => version + 1);
  }

  async function confirmPhoto() {
    if (!loaded) return;
    setBusy('exporting');
    try {
      const result = await exportCrop(loaded.source, loaded.turns, rect);
      router.replace({
        pathname: '/scan/review',
        params: { uri: result.uri, width: String(result.width), height: String(result.height) },
      });
    } catch {
      Alert.alert("Couldn't save the cropped image", 'Please try again.');
      setBusy(null);
    }
  }

  // Fit the preview inside the canvas, leaving room for the frame handles.
  const display =
    loaded && canvasSize
      ? fitContain(loaded.preview, {
          width: canvasSize.width - CROP_CANVAS_PADDING * 2,
          height: canvasSize.height - CROP_CANVAS_PADDING * 2,
        })
      : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      {/* The crop screen is always dark, whatever the system theme. */}
      <StatusBar style="light" />
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {loaded && display && display.width > 0 ? (
          <CropCanvas
            // A new preview or a reset means a fresh frame at the current rect.
            key={`${loaded.preview.uri}:${Math.round(display.width)}x${Math.round(display.height)}:${frameVersion}`}
            uri={loaded.preview.uri}
            width={display.width}
            height={display.height}
            initialRect={rect}
            onChange={setRect}
          />
        ) : (
          <ActivityIndicator color="#FFFFFF" size="large" accessibilityLabel="Loading image" />
        )}
      </View>

      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.toolRow}>
          <View style={styles.toolButton}>
            <Button
              label="Left"
              icon="arrow-undo"
              variant="secondary"
              onDark
              onPress={() => rotate(-1)}
              disabled={!loaded || busy !== null}
              accessibilityHint="Rotates the image a quarter turn counter-clockwise"
            />
          </View>
          <View style={styles.toolButton}>
            <Button
              label="Right"
              icon="arrow-redo"
              variant="secondary"
              onDark
              onPress={() => rotate(1)}
              disabled={!loaded || busy !== null}
              accessibilityHint="Rotates the image a quarter turn clockwise"
            />
          </View>
          <View style={styles.toolButton}>
            <Button
              label="Reset"
              icon="refresh"
              variant="secondary"
              onDark
              onPress={reset}
              disabled={!loaded || busy !== null}
              accessibilityHint="Resets the crop to the whole image"
            />
          </View>
        </View>
        <Button
          label="Use this photo"
          icon="checkmark"
          onPress={confirmPhoto}
          loading={busy === 'exporting'}
          disabled={!loaded || busy !== null}
        />
        <Text style={styles.hint}>Drag the corners to crop to the work you want checked.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  toolRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toolButton: {
    flex: 1,
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
});
