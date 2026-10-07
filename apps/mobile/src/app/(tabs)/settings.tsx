import Ionicons from '@expo/vector-icons/Ionicons';
import type { UsageSummary } from '@calc/shared';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCurrentUnit } from '@/features/settings/currentUnit';
import { UNITS } from '@/features/settings/units';
import { fetchUsage } from '@/features/usage/api';
import { budgetState, describePeriod, formatDollars } from '@/features/usage/format';
import { radius, spacing, useAppTheme } from '@/theme';

type Row = { label: string; value: string };

const SECTIONS: { title: string; rows: Row[]; footer?: string }[] = [
  {
    title: 'Appearance',
    rows: [{ label: 'Theme', value: 'Matches your device' }],
  },
  {
    title: 'Privacy',
    rows: [],
    footer:
      "Your photos stay on this phone. To check a page, it's sent to our grading server and the AI model it uses. Our server doesn't save it.",
  },
];

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const version = Constants.expoConfig?.version ?? 'dev';

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <UnitPicker />
      <Usage />
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
            {section.title}
          </Text>
          {section.rows.length > 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {section.rows.map((row) => (
                <View key={row.label} style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{row.label}</Text>
                  <Text style={[styles.rowValue, { color: colors.textMuted }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {section.footer ? (
            <Text style={[styles.footer, { color: colors.textMuted }]}>{section.footer}</Text>
          ) : null}
        </View>
      ))}
      <Text style={[styles.version, { color: colors.textMuted }]}>Calculus Tutor {version}</Text>
    </ScrollView>
  );
}

/** Pages, solutions and dollars so far, from the server; refreshed each time Settings opens. */
function Usage() {
  const { colors } = useAppTheme();
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      fetchUsage(controller.signal)
        .then((s) => {
          setSummary(s);
          setFailed(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
      return () => controller.abort();
    }, []),
  );

  const budget = summary ? budgetState(summary) : null;
  const budgetColor = budget?.level === 'ok' ? colors.primary : budget?.level === 'near' ? colors.unclear : colors.error;
  const rows = summary
    ? [
        { label: 'Today', value: describePeriod(summary.today) },
        { label: 'This month', value: describePeriod(summary.month) },
        { label: 'All time', value: describePeriod(summary.all_time) },
        ...(summary.avg_page_cost_usd !== null ? [{ label: 'Per page (avg)', value: formatDollars(summary.avg_page_cost_usd) }] : []),
      ]
    : [];

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
        Usage
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {!summary ? (
          <View style={styles.row}>
            {failed ? (
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{"Can't reach the grading server"}</Text>
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
          </View>
        ) : (
          rows.map((row, i) => (
            <View key={row.label} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{row.label}</Text>
              <Text style={[styles.rowValue, { color: colors.textMuted }]}>{row.value}</Text>
            </View>
          ))
        )}
        {budget ? (
          <View style={[styles.budget, { borderTopColor: colors.border }]}>
            <View style={styles.budgetLabels}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Monthly budget</Text>
              <Text style={[styles.rowValue, { color: budget.level === 'ok' ? colors.textMuted : budgetColor }]}>{budget.label}</Text>
            </View>
            <View
              style={[styles.bar, { backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(budget.fraction * 100) }}
            >
              <View style={[styles.barFill, { width: `${budget.fraction * 100}%`, backgroundColor: budgetColor }]} />
            </View>
          </View>
        ) : null}
      </View>
      <Text style={[styles.footer, { color: colors.textMuted }]}>
        {budget?.level === 'over'
          ? "This month's budget is used up, so checking pages is paused until next month (or until the budget is raised on the server)."
          : budget?.level === 'near'
            ? 'Most of this month’s budget is used.'
            : 'Estimated from what each page and solution cost. Opening a saved page is free.'}
      </Text>
    </View>
  );
}

/** Tap a unit to select it; tap it again to clear. */
function UnitPicker() {
  const { colors } = useAppTheme();
  const [unit, setUnit] = useCurrentUnit();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
        Current unit
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {UNITS.map((name, i) => {
          const selected = name === unit;
          return (
            <Pressable
              key={name}
              onPress={() => setUnit(selected ? null : name)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            >
              <Text style={[styles.rowLabel, { color: colors.text, fontWeight: selected ? '700' : '400' }]}>{name}</Text>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.footer, { color: colors.textMuted }]}>
        {unit
          ? `Pages are checked with ${unit} in mind, and mistakes from earlier topics (like algebra) are pointed out as such. Tap it again to clear.`
          : 'Pick what you are studying so explanations are pitched at the right level. Optional.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowValue: {
    fontSize: 16,
    flexShrink: 1,
    textAlign: 'right',
  },
  budget: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  budgetLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  footer: {
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: spacing.xs,
  },
  version: {
    fontSize: 13,
    textAlign: 'center',
  },
});
