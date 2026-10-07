import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { latexToText } from '@/features/grading/latexText';

/** Smallest scale used to squeeze a wide expression onto one screen width. */
const MIN_SCALE = 0.7;

type Props = {
  /** LaTeX source, used for the text fallback and accessibility. */
  latex: string;
  /** SVG rendered by the server, sized for 18px text. Null → text fallback. */
  svg: string | null;
  color: string;
};

/**
 * Shows math in real notation (stacked fractions, exponents, limits) from
 * the server-rendered SVG. Wide expressions shrink to fit, then scroll
 * sideways; if there's no SVG it falls back to readable text.
 */
export function MathView({ latex, svg, color }: Props) {
  const [available, setAvailable] = useState(0);
  const size = svg ? svgSize(svg) : null;

  if (!svg || !size) {
    return <Text style={[styles.fallback, { color }]}>{latexToText(latex)}</Text>;
  }

  const scale = available > 0 && size.width > available ? Math.max(available / size.width, MIN_SCALE) : 1;
  const width = size.width * scale;
  const height = size.height * scale;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setAvailable(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={latexToText(latex)}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={width > available} scrollEnabled={width > available}>
        <SvgXml xml={svg} width={width} height={height} color={color} />
      </ScrollView>
    </View>
  );
}

/** Reads the pixel width/height the server put on the root <svg>. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const width = Number(/\bwidth="([\d.]+)"/.exec(root)?.[1]);
  const height = Number(/\bheight="([\d.]+)"/.exec(root)?.[1]);
  return width > 0 && height > 0 ? { width, height } : null;
}

const styles = StyleSheet.create({
  fallback: {
    fontSize: 18,
    lineHeight: 26,
  },
});
