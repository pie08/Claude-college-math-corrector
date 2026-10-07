import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { proseText } from '@/features/grading/latexText';
import { getScan, type GradedScan } from '@/features/history/repository';
import { IssueSheet } from '@/features/results/IssueSheet';
import { marksOf, type Mark } from '@/features/results/marks';
import { PageOverlay } from '@/features/results/PageOverlay';
import { tutorableProblems } from '@/features/tutor/context';
import { radius, spacing, useAppTheme } from '@/theme';

/** Results for a saved scan. `mark` (1-based) opens that mark's explanation right away. */
export default function ResultsScreen() {
  const { id, mark: markParam } = useLocalSearchParams<{ id: string; mark?: string }>();
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [scan, setScan] = useState<GradedScan | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  const marks = useMemo(() => (scan ? marksOf(scan.result) : []), [scan]);

  useEffect(() => {
    let cancelled = false;
    getScan(db, id).then((loaded) => {
      if (cancelled) return;
      setScan(loaded);
      const wanted = Number(markParam);
      if (loaded && wanted > 0) {
        const index = marksOf(loaded.result).findIndex((m) => m.number === wanted);
        if (index >= 0) setOpen(index);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, id, markParam]);

  if (scan === undefined) {
    return (
      <View style={[styles.screen, styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!scan) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState icon="time-outline" title="Result not found" body="This scan may have been deleted.">
          <Button label="Back" icon="arrow-back" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const { result } = scan;
  const mistakes = marks.filter((m) => m.status === 'incorrect').length;
  const unclear = marks.length - mistakes;
  const notes = result.problems.flatMap((p) => p.notation_notes.map((note) => ({ label: p.label, note })));
  const gradable = result.page_status === 'ok';
  const tutorProblems = tutorableProblems(result);
  const openTutor = (label: string) => router.push({ pathname: '/scan/tutor', params: { id: scan.id, label } });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <PageOverlay
        imageUri={scan.imageUri}
        imageSize={{ width: scan.width, height: scan.height }}
        marks={marks}
        selectedId={open === null ? null : (marks[open]?.id ?? null)}
        onSelect={(mark) => setOpen(marks.indexOf(mark))}
      />

      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ScrollView contentContainerStyle={styles.panelContent}>
          {!gradable ? (
            <Banner
              icon="camera-reverse-outline"
              color={colors.unclear}
              background={colors.unclearSoft}
              title={result.page_status === 'no_math_found' ? 'No math work found' : "Couldn't read this page"}
              body={
                result.page_status === 'no_math_found'
                  ? 'Make sure your written work is in the photo, then try again.'
                  : 'Retake the photo with the page flat, in focus and in good light.'
              }
            />
          ) : mistakes === 0 && unclear === 0 ? (
            <Banner icon="checkmark-circle" color={colors.success} background={colors.surfaceAlt} title="No errors found" body="Every step checked out." />
          ) : (
            <View style={styles.counts} accessibilityRole="summary">
              {mistakes > 0 ? (
                <Count icon="close-circle" color={colors.error} label={`${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`} />
              ) : null}
              {unclear > 0 ? <Count icon="help-circle" color={colors.unclear} label={`${unclear} hard to read`} /> : null}
              <Text style={[styles.tapHint, { color: colors.textMuted }]}>Tap a mark for the fix</Text>
            </View>
          )}

          {unclear > 0 && gradable ? (
            <Banner
              icon="camera-outline"
              color={colors.unclear}
              background={colors.unclearSoft}
              title="Some writing was hard to read"
              body="Retake those parts closer and in better light to get them checked."
            />
          ) : null}

          <Text style={[styles.summary, { color: colors.text }]}>{proseText(result.overall_summary)}</Text>

          {marks.map((mark, i) => (
            <MarkRow key={mark.id} mark={mark} onPress={() => setOpen(i)} />
          ))}

          {tutorProblems.length > 0 ? (
            <View style={styles.notes}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Work out a problem step by step</Text>
              <View style={styles.chips}>
                {tutorProblems.map((p) => (
                  <Pressable
                    key={p.label}
                    onPress={() => openTutor(p.label)}
                    accessibilityRole="button"
                    accessibilityLabel={`Work out problem ${p.label} step by step`}
                    style={({ pressed }) => [
                      styles.chip,
                      { borderColor: p.hasMistake ? colors.error : colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    {p.hasMistake ? <Ionicons name="close-circle" size={14} color={colors.error} /> : null}
                    <Text style={[styles.chipText, { color: colors.text }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {notes.length > 0 ? (
            <View style={styles.notes}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Notation tips</Text>
              {notes.map((n, i) => (
                <Text key={i} style={[styles.note, { color: colors.textMuted }]}>
                  {n.label}: {proseText(n.note)}
                </Text>
              ))}
            </View>
          ) : null}

          <Text style={[styles.meta, { color: colors.textMuted }]}>
            Checked in {(result.meta.latency_ms / 1000).toFixed(1)} s by {result.meta.model}
          </Text>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button label="Scan another page" icon="camera" variant="secondary" onPress={() => router.dismissAll()} />
        </View>
      </View>

      <IssueSheet marks={marks} index={open} onChangeIndex={setOpen} onWorkItOut={(mark) => openTutor(mark.problemLabel)} />
    </View>
  );
}

function MarkRow({ mark, onPress }: { mark: Mark; onPress: () => void }) {
  const { colors } = useAppTheme();
  const incorrect = mark.status === 'incorrect';
  const color = incorrect ? colors.error : colors.unclear;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${incorrect ? 'Mistake' : 'Hard to read'} ${mark.number}, problem ${mark.problemLabel}: ${mark.concept}`}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.rowBadge, { backgroundColor: color }]}>
        <Ionicons name={incorrect ? 'close' : 'help'} size={14} color="#FFFFFF" />
        <Text style={styles.rowBadgeText}>{mark.number}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          Problem {mark.problemLabel} · {proseText(mark.concept)}
        </Text>
        <Text style={[styles.rowBody, { color: colors.textMuted }]} numberOfLines={2}>
          {proseText(mark.explanation)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

type IconName = ComponentProps<typeof Ionicons>['name'];

function Count({ icon, color, label }: { icon: IconName; color: string; label: string }) {
  return (
    <View style={styles.count}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.countText, { color }]}>{label}</Text>
    </View>
  );
}

function Banner(props: { icon: IconName; color: string; background: string; title: string; body: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.banner, { backgroundColor: props.background }]}>
      <Ionicons name={props.icon} size={24} color={props.color} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{props.title}</Text>
        <Text style={[styles.rowBody, { color: colors.textMuted }]}>{props.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    maxHeight: '45%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: -radius.lg,
  },
  panelContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  countText: {
    fontSize: 16,
    fontWeight: '700',
  },
  tapHint: {
    fontSize: 13,
    marginLeft: 'auto',
  },
  summary: {
    fontSize: 15,
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  rowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    minWidth: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    gap: 1,
  },
  rowBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowBody: {
    fontSize: 14,
    lineHeight: 19,
  },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  notes: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    minWidth: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    fontSize: 14,
    lineHeight: 19,
  },
  meta: {
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
