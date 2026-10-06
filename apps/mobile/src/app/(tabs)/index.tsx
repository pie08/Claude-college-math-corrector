import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { pickFromLibrary, scanPage, type CaptureOutcome } from '@/features/capture/captureSources';
import { radius, spacing, useAppTheme } from '@/theme';

const TIPS: { icon: ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'sunny-outline', text: 'Lay the page flat in even light' },
  { icon: 'scan-outline', text: 'Fit every step of the problem in the frame' },
  { icon: 'pencil-outline', text: 'Dark pen or firm pencil reads best' },
];

export default function ScanScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'scan' | 'library' | null>(null);

  async function capture(source: 'scan' | 'library') {
    setBusy(source);
    try {
      const outcome = source === 'scan' ? await scanPage() : await pickFromLibrary();
      handleOutcome(outcome);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.errorSoft }]}>
            <Ionicons name="close-circle" size={28} color={colors.error} />
          </View>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            Check your calculus work
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Scan a page of homework. Mistakes get marked in red on your page, with the fix and a short explanation.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>For the best results</Text>
        <View style={[styles.tips, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {TIPS.map((tip) => (
            <View key={tip.text} style={styles.tipRow}>
              <Ionicons name={tip.icon} size={20} color={colors.primary} />
              <Text style={[styles.tipText, { color: colors.text }]}>{tip.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Actions live at the bottom of the screen, within thumb reach. */}
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button
          label="Scan a page"
          icon="camera"
          onPress={() => capture('scan')}
          loading={busy === 'scan'}
          disabled={busy !== null}
          accessibilityHint="Opens the camera to scan a page of your work"
        />
        <Button
          label="Choose from photos"
          icon="images-outline"
          variant="secondary"
          onPress={() => capture('library')}
          loading={busy === 'library'}
          disabled={busy !== null}
        />
      </View>
    </View>
  );
}

function handleOutcome(outcome: CaptureOutcome) {
  switch (outcome.kind) {
    case 'captured':
      router.push({ pathname: '/scan/crop', params: { uri: outcome.uri } });
      return;
    case 'cancelled':
      return;
    case 'permission-denied':
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings to scan your work, or choose an existing photo instead.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    case 'unavailable':
      Alert.alert("Couldn't open the camera", outcome.message);
      return;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  hero: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  tips: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  tipText: {
    fontSize: 15,
    flex: 1,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
});
