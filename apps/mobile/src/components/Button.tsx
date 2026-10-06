import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  /** Use on dark image canvases, where theme surface colors would clash. */
  onDark?: boolean;
};

/** Large, thumb-friendly button (min 52pt tall) used for all primary actions. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  accessibilityHint,
  onDark = false,
}: Props) {
  const { colors } = useAppTheme();
  const inactive = disabled || loading;

  const background =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? onDark
          ? 'rgba(255, 255, 255, 0.14)'
          : colors.surfaceAlt
        : 'transparent';
  const foreground =
    variant === 'primary' ? colors.onPrimary : onDark ? '#FFFFFF' : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : icon ? (
          <Ionicons name={icon} size={20} color={foreground} />
        ) : null}
        <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
  },
});
