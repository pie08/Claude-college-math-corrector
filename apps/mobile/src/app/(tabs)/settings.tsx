import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCurrentUnit } from '@/features/settings/currentUnit';
import { UNITS } from '@/features/settings/units';
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
