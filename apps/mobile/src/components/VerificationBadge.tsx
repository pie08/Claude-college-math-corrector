import Ionicons from '@expo/vector-icons/Ionicons';
import type { Issue } from '@calc/shared';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useAppTheme } from '@/theme';

/**
 * One line under a fix saying whether the math engine (SymPy) confirmed it.
 * Nothing is shown when the step couldn't be checked automatically.
 */
export function VerificationBadge({ verification }: { verification: Issue['verification'] }) {
  const { colors } = useAppTheme();
  if (verification === 'cas_verified') {
    return (
      <View style={styles.row} accessible accessibilityLabel="Fix checked by the math engine">
        <Ionicons name="shield-checkmark" size={14} color={colors.success} />
        <Text style={[styles.text, { color: colors.success }]}>Checked by the math engine</Text>
      </View>
    );
  }
  if (verification === 'cas_disagrees') {
    return (
      <View style={styles.row} accessible>
        <Ionicons name="warning" size={14} color={colors.unclear} />
        <Text style={[styles.text, { color: colors.unclear }]}>
          {"The math engine couldn't confirm this fix. Double-check it."}
        </Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  text: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
});
