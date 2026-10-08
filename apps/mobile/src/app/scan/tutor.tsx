import Ionicons from '@expo/vector-icons/Ionicons';
import type { InlineMath, TutorResult, TutorStep } from '@calc/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { MathView } from '@/components/MathView';
import { RichText } from '@/components/RichText';
import { VerificationBadge } from '@/components/VerificationBadge';
import { describeGradingError, GradingError } from '@/features/grading/api';
import { proseText } from '@/features/grading/latexText';
import { deleteTutorSolution, getScan, getTutorSolution, saveTutorSolution } from '@/features/history/repository';
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
  // Set by "Work it out again": skip the saved solution and ask for a new one.
  const [fresh, setFresh] = useState(false);
  // The student's instructions for the tutor: the ones used for the next
  // request, the text being edited, and whether the editor is open.
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
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
      const context = tutorContextFor(scan.result, label, instructions);
      setStatement(context.statement);
      const saved = fresh ? null : await getTutorSolution(db, id, label);
      if (saved) {
        setShown(saved.steps.length);
        setInstructions(saved.instructions);
        return saved;
      }
      const solved = await requestSolution(scan.imageUri, context, { unit: getCurrentUnit() ?? undefined, signal: controller.signal, fresh });
      await saveTutorSolution(db, id, solved);
      return solved;
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
    // `instructions` is read when a new solution is requested (attempt changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id, label, attempt, fresh]);

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

  /** Throws away the saved solution and asks for a new one with `next` instructions. */
  function redo(next: string) {
    void deleteTutorSolution(db, id, label);
    revealed.current = false;
    setInstructions(next.trim());
    setEditing(false);
    setSolution(null);
    setShown(1);
    setElapsed(0);
    setFresh(true);
    setAttempt((n) => n + 1);
  }
  const allShown = shown >= total;
  const offTrack = solution.off_track_step;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        onContentSizeChange={() => {
          if (revealed.current) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Problem {solution.label}</Text>
          {statement ? <MathView latex={statement} svg={solution.statement_svg} color={colors.text} /> : null}
        </View>

        <InstructionsCard
          applied={solution.instructions}
          editing={editing}
          draft={draft}
          onEdit={() => {
            setDraft(solution.instructions);
            setEditing(true);
          }}
          onChange={setDraft}
          onCancel={() => setEditing(false)}
          onSubmit={() => redo(draft)}
        />

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
          <View style={styles.flex}>
            <RichText text={solution.intro} math={solution.inline_math} style={[styles.body, { color: colors.text }]} />
          </View>
        </View>

        {solution.steps.slice(0, shown).map((step, i) => (
          <StepCard key={i} step={step} index={i} offTrack={i === offTrack} math={solution.inline_math} />
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
          <>
            <View style={styles.flex}>
              <Button
                label="Work it out again"
                icon="refresh"
                variant="secondary"
                accessibilityHint="Asks for a new solution (about 2 cents)"
                onPress={() => redo(instructions)}
              />
            </View>
            <View style={styles.flex}>
              <Button label="Done" icon="checkmark" onPress={() => router.back()} />
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** Quick picks for common instructions. */
const SUGGESTIONS = ['Use the limit definition', 'Show every algebra step', "No L'Hôpital's rule"];

/**
 * The student's instructions for the tutor ("use the limit definition"):
 * shows the ones this solution followed, and lets them write new ones and
 * get the problem worked out again (a new request, about 2 cents).
 */
function InstructionsCard(props: {
  applied: string;
  editing: boolean;
  draft: string;
  onEdit: () => void;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { colors } = useAppTheme();

  if (!props.editing) {
    return (
      <Pressable
        onPress={props.onEdit}
        accessibilityRole="button"
        accessibilityLabel={props.applied ? `Your instructions: ${props.applied}. Change them` : 'Add instructions for the tutor'}
        style={({ pressed }) => [styles.instructionsRow, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="create-outline" size={18} color={colors.primary} />
        <Text style={[styles.instructionsText, { color: props.applied ? colors.text : colors.primary }]} numberOfLines={2}>
          {props.applied ? `Following your instructions: “${props.applied}”` : 'Add instructions for the tutor'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Instructions for the tutor</Text>
      <TextInput
        value={props.draft}
        onChangeText={props.onChange}
        placeholder="e.g. Use the limit definition of the derivative"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={500}
        autoFocus
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        accessibilityLabel="Instructions for the tutor"
      />
      <View style={styles.suggestions}>
        {SUGGESTIONS.map((text) => (
          <Pressable
            key={text}
            onPress={() => props.onChange(text)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.suggestion, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.suggestionText, { color: colors.text }]}>{text}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.editButtons}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={props.onCancel} />
        </View>
        <View style={styles.flex}>
          <Button
            label="Work it out"
            icon="school-outline"
            onPress={props.onSubmit}
            accessibilityHint="Asks for a new solution that follows your instructions (about 2 cents)"
          />
        </View>
      </View>
    </View>
  );
}

function StepCard({ step, index, offTrack, math }: { step: TutorStep; index: number; offTrack: boolean; math: InlineMath }) {
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
      <RichText text={step.explanation} math={math} style={[styles.body, { color: colors.textMuted }]} />
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
  instructionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  instructionsText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    minHeight: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  suggestion: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
  },
  editButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
