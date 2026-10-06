import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useAppTheme } from '@/theme';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  /** Optional call to action rendered under the text. */
  children?: ReactNode;
};

/** Centered icon + message used when a list has nothing to show yet. */
export function EmptyState({ icon, title, body, children }: Props) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name={icon} size={32} color={colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  action: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
});
