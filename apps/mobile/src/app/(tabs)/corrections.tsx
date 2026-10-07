import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { MathView } from '@/components/MathView';
import { proseText } from '@/features/grading/latexText';
import { formatWhen } from '@/features/history/format';
import { listCorrections, setReviewed, type SavedCorrection } from '@/features/history/repository';
import { conceptsByFrequency } from '@/features/history/rows';
import { radius, spacing, useAppTheme } from '@/theme';

type Filter = 'toReview' | 'all';

/**
 * Every mistake from every scan, newest first: what you wrote and the fix in
 * math notation. Mark one "Got it" once you've learned it; filter by concept
 * to drill one topic.
 */
export default function CorrectionsScreen() {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [items, setItems] = useState<SavedCorrection[] | null>(null);
  const [filter, setFilter] = useState<Filter>('toReview');
  const [concept, setConcept] = useState<string | null>(null);

  const load = useCallback(() => {
    listCorrections(db).then(setItems);
  }, [db]);
  useFocusEffect(load);

  const toReviewCount = items?.filter((c) => !c.reviewed).length ?? 0;
  const concepts = useMemo(
    () => conceptsByFrequency((items ?? []).map((c) => c.mark.concept.trim().toLowerCase())),
    [items],
  );
  const shown = (items ?? []).filter(
    (c) => (filter === 'all' || !c.reviewed) && (!concept || c.mark.concept.trim().toLowerCase() === concept),
  );

  async function toggleReviewed(item: SavedCorrection) {
    await setReviewed(db, item.id, !item.reviewed);
    load();
  }

  if (items && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          icon="create-outline"
          title="No corrections yet"
          body="When the tutor finds a mistake in your work, the fix shows up here so you can review it before a test."
        />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={shown}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="tablist">
            {(['toReview', 'all'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === f }}
                style={[styles.segmentButton, filter === f && { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.segmentText, { color: filter === f ? colors.text : colors.textMuted }]}>
                  {f === 'toReview' ? `To review (${toReviewCount})` : `All (${items?.length ?? 0})`}
                </Text>
              </Pressable>
            ))}
          </View>
          {concepts.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {[null, ...concepts].map((c) => {
                const selected = concept === c;
                return (
                  <Pressable
                    key={c ?? 'all'}
                    onPress={() => setConcept(c)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.chip,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.text }]}>
                      {c ? proseText(c) : 'All topics'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        items ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {filter === 'toReview' ? "You've reviewed everything here. Nice work." : 'Nothing matches this filter.'}
          </Text>
        ) : null
      }
      renderItem={({ item }) => <CorrectionCard item={item} onToggleReviewed={() => toggleReviewed(item)} />}
    />
  );
}

function CorrectionCard({ item, onToggleReviewed }: { item: SavedCorrection; onToggleReviewed: () => void }) {
  const { colors } = useAppTheme();
  const { mark } = item;
  const open = () =>
    router.push({ pathname: '/scan/results/[id]', params: { id: item.scanId, mark: String(mark.number) } });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: item.reviewed ? 0.6 : 1 }]}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityHint="Shows this mistake on your page" style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={[styles.conceptPill, { backgroundColor: colors.errorSoft }]}>
            <Ionicons name="close-circle" size={14} color={colors.error} />
            <Text style={[styles.conceptText, { color: colors.error }]} numberOfLines={1}>
              {proseText(mark.concept)}
            </Text>
          </View>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {mark.problemLabel} · {formatWhen(item.createdAt)}
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>You wrote</Text>
        <MathView latex={mark.transcription} svg={mark.transcription_svg} color={colors.text} />

        {mark.correction ? (
          <View style={[styles.fix, { borderColor: colors.success }]}>
            <Text style={[styles.label, { color: colors.success }]}>Fix</Text>
            <MathView latex={mark.correction} svg={mark.correction_svg} color={colors.text} />
          </View>
        ) : null}

        <Text style={[styles.explanation, { color: colors.textMuted }]} numberOfLines={3}>
          {proseText(mark.explanation)}
        </Text>
      </Pressable>

      <Pressable
        onPress={onToggleReviewed}
        accessibilityRole="button"
        accessibilityLabel={item.reviewed ? 'Review again' : 'Got it'}
        style={[styles.reviewButton, { borderTopColor: colors.border }]}
      >
        <Ionicons name={item.reviewed ? 'refresh' : 'checkmark-done'} size={18} color={colors.primary} />
        <Text style={[styles.reviewText, { color: colors.primary }]}>{item.reviewed ? 'Review again' : 'Got it'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chips: {
    gap: spacing.sm,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    fontSize: 15,
    marginTop: spacing.xxl,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  conceptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
  conceptText: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  meta: {
    fontSize: 13,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  fix: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  explanation: {
    fontSize: 14,
    lineHeight: 19,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
