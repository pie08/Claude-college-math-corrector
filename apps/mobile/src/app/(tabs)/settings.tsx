import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

type Row = { label: string; value: string };

const SECTIONS: { title: string; rows: Row[]; footer?: string }[] = [
  {
    title: 'Studying',
    // The unit picker arrives in Phase 5.
    rows: [{ label: 'Current unit', value: 'Not set' }],
    footer: 'Choosing your current unit lets the tutor tailor explanations. Coming in a later update.',
  },
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
