import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { darkPalette, lightPalette, type Palette } from './colors';

export type { Palette } from './colors';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export type AppTheme = {
  scheme: 'light' | 'dark';
  colors: Palette;
  /** Theme handed to the router so headers and tab bars match the app. */
  navigation: Theme;
};

/** Current theme, following the device's light/dark setting. */
export function useAppTheme(): AppTheme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return useMemo(() => {
    const colors = scheme === 'dark' ? darkPalette : lightPalette;
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    const navigation: Theme = {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
    return { scheme, colors, navigation };
  }, [scheme]);
}
