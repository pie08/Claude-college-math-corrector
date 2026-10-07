import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { describeGradingError, gradePage, GradingError, type GradingProgress } from '@/features/grading/api';
import { saveScan } from '@/features/history/repository';
import { getCurrentUnit } from '@/features/settings/currentUnit';
import { autoTutorTarget } from '@/features/tutor/context';
import { radius, spacing, useAppTheme } from '@/theme';

/** The steps shown while grading, in order, keyed by the server's stages. */
const STEPS: { stages: GradingProgress['stage'][]; label: string }[] = [
  { stages: ['uploading'], label: 'Uploading your page' },
  { stages: ['received', 'checking_image'], label: 'Checking the photo' },
  { stages: ['reading'], label: 'Reading your work' },
  { stages: ['writing'], label: 'Writing up the results' },
  { stages: ['validating'], label: 'Double-checking' },
];

export default function GradingScreen() {
  const params = useLocalSearchParams<{ uri: string; width: string; height: string }>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<GradingProgress>({ stage: 'uploading', message: '' });
  const [error, setError] = useState<GradingError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const db = useSQLiteContext();
  const [unit] = useState(getCurrentUnit);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    gradePage(params.uri, { signal: controller.signal, onProgress: setProgress, unit: unit ?? undefined })
      .then(async (result) => {
        const id = await saveScan(db, {
          imageUri: params.uri,
          width: Number(params.width),
          height: Number(params.height),
          result,
        });
        return { id, target: autoTutorTarget(result) };
      })
      .then(({ id, target }) => {
        if (controller.signal.aborted) return;
        // A page with no work on it goes straight to the tutor; the results
        // screen stays underneath, so Back returns to the page.
        router.replace({
          pathname: '/scan/results/[id]',
          params: { id, ...(target && target !== 'choose' ? { tutor: target.label } : {}) },
        });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof GradingError ? e : new GradingError('grading_failed', String(e)));
      })
      .finally(() => clearInterval(timer));

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [params.uri, params.width, params.height, attempt, db, unit]);

  const current = STEPS.findIndex((s) => s.stages.includes(progress.stage));

  function retry() {
    setError(null);
    setElapsed(0);
    setProgress({ stage: 'uploading', message: '' });
    setAttempt((n) => n + 1);
  }

  if (error) {
    const { title, body, canRetry } = describeGradingError(error);
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { paddingHorizontal: spacing.xl }]}>
          <View style={[styles.errorIcon, { backgroundColor: colors.errorSoft }]}>
            <Ionicons name="alert-circle" size={36} color={colors.error} />
          </View>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
        </View>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {canRetry ? <Button label="Try again" icon="refresh" onPress={retry} /> : null}
          <Button label="Back" icon="arrow-back" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <Image source={{ uri: params.uri }} style={styles.thumb} resizeMode="contain" />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          Checking your work
        </Text>
        <View style={[styles.steps, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {STEPS.map((step, i) => {
            const state = i < current ? 'done' : i === current ? 'active' : 'pending';
            const count = step.stages.includes('writing') && progress.problemsFound ? ` (${progress.problemsFound} found)` : '';
            return (
              <View key={step.label} style={styles.step}>
                {state === 'done' ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                ) : state === 'active' ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.stepIcon} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={colors.border} />
                )}
                <Text
                  style={[
                    styles.stepText,
                    { color: state === 'pending' ? colors.textMuted : colors.text, fontWeight: state === 'active' ? '700' : '400' },
                  ]}
                >
                  {step.label}
                  {state === 'active' ? count : ''}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {elapsed}s · usually 15–25 seconds, longer for busy pages
        </Text>
        {unit ? <Text style={[styles.hint, { color: colors.textMuted }]}>Unit: {unit}</Text> : null}
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button
          label="Cancel"
          icon="close"
          variant="secondary"
          onPress={() => {
            abortRef.current?.abort();
            router.back();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  thumb: {
    width: 120,
    height: 150,
    borderRadius: radius.sm,
    opacity: 0.9,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  steps: {
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepIcon: {
    width: 22,
  },
  stepText: {
    fontSize: 16,
  },
  hint: {
    fontSize: 13,
  },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
});
