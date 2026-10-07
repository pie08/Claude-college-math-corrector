import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { MathView } from '@/components/MathView';
import { VerificationBadge } from '@/components/VerificationBadge';
import { proseText } from '@/features/grading/latexText';
import { radius, spacing, useAppTheme } from '@/theme';

import type { Mark } from './marks';

type Props = {
  marks: Mark[];
  /** Index into `marks` of the open mark, or null when closed. */
  index: number | null;
  onChangeIndex: (index: number | null) => void;
  /** Opens the step-by-step tutor for this mark's problem. */
  onWorkItOut?: (mark: Mark) => void;
};

/**
 * Bottom sheet for one mark: what you wrote, what went wrong, and the fix.
 * Previous/Next step through every mark on the page.
 */
export function IssueSheet({ marks, index, onChangeIndex, onWorkItOut }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const mark = index === null ? undefined : marks[index];
  const close = () => onChangeIndex(null);

  return (
    <Modal visible={!!mark} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      {mark && index !== null ? (
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <ScrollView contentContainerStyle={styles.content}>
            <Header mark={mark} total={marks.length} onClose={close} />

            <Section label="You wrote">
              <MathView latex={mark.transcription} svg={mark.transcription_svg} color={colors.text} />
            </Section>

            <Section label={mark.status === 'incorrect' ? 'What went wrong' : "What I couldn't read"}>
              <Text style={[styles.body, { color: colors.text }]}>{proseText(mark.explanation)}</Text>
            </Section>

            {mark.correction ? (
              <View style={[styles.fix, { borderColor: colors.success }]}>
                <View style={styles.fixHeader}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={[styles.label, { color: colors.success }]}>Fix</Text>
                </View>
                <MathView latex={mark.correction} svg={mark.correction_svg} color={colors.text} />
                <VerificationBadge verification={mark.verification} />
              </View>
            ) : null}

            {mark.later_steps_note ? (
              <Text style={[styles.note, { color: colors.textMuted }]}>{proseText(mark.later_steps_note)}</Text>
            ) : null}

            {mark.status === 'unclear' ? (
              <Text style={[styles.note, { color: colors.textMuted }]}>
                Retake the photo closer and in better light to get this step checked.
              </Text>
            ) : null}

            {onWorkItOut && mark.status === 'incorrect' ? (
              <Button
                label={`Work out problem ${mark.problemLabel} step by step`}
                icon="school-outline"
                variant="ghost"
                onPress={() => {
                  close();
                  onWorkItOut(mark);
                }}
              />
            ) : null}
          </ScrollView>

          <View style={styles.nav}>
            <View style={styles.navButton}>
              <Button
                label="Previous"
                icon="chevron-back"
                variant="secondary"
                onPress={() => onChangeIndex(index - 1)}
                disabled={index === 0}
              />
            </View>
            <View style={styles.navButton}>
              <Button
                label={index === marks.length - 1 ? 'Done' : 'Next'}
                icon={index === marks.length - 1 ? 'checkmark' : 'chevron-forward'}
                onPress={() => (index === marks.length - 1 ? close() : onChangeIndex(index + 1))}
              />
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

function Header({ mark, total, onClose }: { mark: Mark; total: number; onClose: () => void }) {
  const { colors } = useAppTheme();
  const incorrect = mark.status === 'incorrect';
  const color = incorrect ? colors.error : colors.unclear;
  return (
    <View style={styles.header}>
      <View style={[styles.statusPill, { backgroundColor: incorrect ? colors.errorSoft : colors.unclearSoft }]}>
        <Ionicons name={incorrect ? 'close-circle' : 'help-circle'} size={18} color={color} />
        <Text style={[styles.statusText, { color }]}>{incorrect ? 'Mistake' : 'Hard to read'}</Text>
      </View>
      <Text style={[styles.meta, { color: colors.textMuted }]} accessibilityRole="header">
        Problem {mark.problemLabel} · {mark.number} of {total}
      </Text>
      <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
        <Ionicons name="close" size={24} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.sm,
  },
  content: {
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
  },
  fix: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fixHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  navButton: {
    flex: 1,
  },
});
