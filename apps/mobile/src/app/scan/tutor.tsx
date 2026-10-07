import Ionicons from '@expo/vector-icons/Ionicons';
import type { TutorResult, TutorStep } from '@calc/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { MathView } from '@/components/MathView';
import { VerificationBadge } from '@/components/VerificationBadge';
import { describeGradingError, GradingError } from '@/features/grading/api';
import { proseText } from '@/features/grading/latexText';
import { getScan, getTutorSolution, saveTutorSolution } from '@/features/history/repository';
import { getCurrentUnit } from '@/features/settings/currentUnit';
import { requestSolution } from '@/features/tutor/api';
import { tutorContextFor } from '@/features/tutor/context';
import { radius, spacing, useAppTheme } from '@/theme';

/**
 * Works out one problem from a saved scan, step by step. A saved solution
 * opens instantly; otherwise the server is asked once and the answer kept.
 */
export default function TutorScreen() {
  const { id, label } = useLocalSearchParams<{ id: string; label: string }>();
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [solution, setSolution] = useState<TutorResult | null>(null);
  const [statement, setStatement] = useState('');
  const [error, setError] = useState<GradingError | null>(null);
  const [shown, setShown] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  // Scroll to a newly revealed step, but not when a saved solution first opens.
  const revealed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    (async () => {
      const scan = await getScan(db, id);
      if (!scan) throw new GradingError('bad_request', 'This scan was deleted.');
      const context = tutorContextFor(scan.result, label);
      setStatement(context.statement);
      const saved = await getTutorSolution(db, id, label);
      if (saved) {
        setShown(saved.steps.length);
        return saved;
      }
      const fresh = await requestSolution(scan.imageUri, context, { unit: getCurrentUnit() ?? undefined, signal: controller.signal });
      await saveTutorSolution(db, id, fresh);
      return fresh;
    })()
      .then((result) => {
        if (!controller.signal.aborted) setSolution(result);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof GradingError ? e : new GradingError('grading_failed', String(e)));
      })
      .finally(() => clearInterval(timer));

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [db, id, label, attempt]);

  if (error) {
    const { title, body, canRetry } = describeGradingError(error);
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle" size={40} color={colors.error} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>{body}</Text>
        <View style={styles.buttons}>
          {canRetry ? (
            <Button
              label="Try again"
              icon="refresh"
              onPress={() => {
                setError(null);
                setElapsed(0);
                setAttempt((n) => n + 1);
              }}
            />
          ) : null}
          <Button label="Back" icon="arrow-back" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (!solution) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityLiveRegion="polite">
          Working out problem {label}
        </Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>{elapsed}s · usually 10–20 seconds</Text>
      </View>
    );
  }

  const total = solution.steps.length;
  const allShown = shown >= total;
  const offTrack = solution.off_track_step;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => {
          if (revealed.current) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Problem {solution.label}</Text>
          {statement ? <MathView latex={statement} svg={null} color={colors.text} /> : null}
        </View>

        <View
          style={[
            styles.intro,
            { backgroundColor: offTrack !== null || !solution.solvable ? colors.unclearSoft : colors.surfaceAlt },
          ]}
        >
          <Ionicons
            name={!solution.solvable ? 'image-outline' : offTrack !== null ? 'git-branch-outline' : 'bulb-outline'}
            size={22}
            color={offTrack !== null || !solution.solvable ? colors.unclear : colors.primary}
          />
          <Text style={[styles.body, styles.flex, { color: colors.text }]}>{proseText(solution.intro)}</Text>
        </View>

        {solution.steps.slice(0, shown).map((step, i) => (
          <StepCard key={i} step={step} index={i} offTrack={i === offTrack} />
        ))}

        {allShown && solution.final_answer ? (
          <View style={[styles.card, styles.answer, { backgroundColor: colors.surface, borderColor: colors.success }]}>
            <View style={styles.answerHeader}>
              <Ionicons name="flag" size={16} color={colors.success} />
              <Text style={[styles.label, { color: colors.success }]}>Answer</Text>
            </View>
            <MathView latex={solution.final_answer} svg={solution.final_answer_svg} color={colors.text} />
            <VerificationBadge verification={solution.verification} subject="answer" />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md), borderTopColor: colors.border }]}>
        {!allShown ? (
          <>
            <View style={styles.flex}>
              <Button
                label="Show all"
                variant="secondary"
                onPress={() => {
                  revealed.current = true;
                  setShown(total);
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={`Next step (${shown + 1}/${total})`}
                icon="arrow-down"
                onPress={() => {
                  revealed.current = true;
                  setShown((n) => n + 1);
                }}
              />
            </View>
          </>
        ) : (
          <View style={styles.flex}>
            <Button label="Done" icon="checkmark" onPress={() => router.back()} />
          </View>
        )}
      </View>
    </View>
  );
}

function StepCard({ step, index, offTrack }: { step: TutorStep; index: number; offTrack: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: offTrack ? colors.unclear : colors.border, borderWidth: offTrack ? 1.5 : StyleSheet.hairlineWidth },
      ]}
    >
      {offTrack ? (
        <Text style={[styles.label, { color: colors.unclear }]}>Your work went off track here</Text>
      ) : null}
      <View style={styles.stepHeader}>
        <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
          <Text style={styles.stepNumberText}>{index + 1}</Text>
        </View>
        <Text style={[styles.stepTitle, { color: colors.text }]} accessibilityRole="header">
          {proseText(step.title)}
        </Text>
      </View>
      {step.math ? <MathView latex={step.math} svg={step.math_svg} color={colors.text} /> : null}
      <Text style={[styles.body, { color: colors.textMuted }]}>{proseText(step.explanation)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  buttons: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  answer: {
    borderWidth: 1.5,
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  intro: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  flex: {
    flex: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stepTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
