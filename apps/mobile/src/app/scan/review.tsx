import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { fitContain, type Size } from '@/features/capture/cropMath';
import { radius, spacing, useAppTheme } from '@/theme';

/**
 * Final check of the processed page before grading. In Phase 2 this screen
 * sends the image to the grading server and shows progress.
 */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ uri: string; width: string; height: string }>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState<Size | null>(null);

  const image: Size = { width: Number(params.width), height: Number(params.height) };
  const display = area ? fitContain(image, area) : null;

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setArea({ width, height });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.imageArea} onLayout={onLayout}>
        {display ? (
          <Image
            source={{ uri: params.uri }}
            style={[styles.image, { width: display.width, height: display.height, borderColor: colors.border }]}
            accessibilityLabel="Your cropped page"
          />
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={[styles.notice, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
          <Text style={[styles.noticeText, { color: colors.textMuted }]}>
            Grading isn&apos;t connected yet. Image ready: {image.width} × {image.height} px.
          </Text>
        </View>
        <Button label="Check my work" icon="sparkles" onPress={() => {}} disabled />
        <Button label="Scan a different page" icon="camera-outline" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  imageArea: {
    flex: 1,
    margin: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
});
