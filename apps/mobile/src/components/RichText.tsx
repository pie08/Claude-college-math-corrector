import type { InlineMath } from '@calc/shared';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { svgSize } from '@/components/MathView';
import { latexToText, proseText, richTokens } from '@/features/grading/latexText';

/** Inline math is rendered on the server for 16px text. */
const RENDERED_SIZE = 16;

type Props = {
  /** Plain text with math marked as `$...$` LaTeX. */
  text: string;
  /** Server-rendered SVGs for the `$...$` pieces; missing ones show as text. */
  math: InlineMath | undefined;
  /** Needs fontSize and color; lineHeight is applied to the words. */
  style: StyleProp<TextStyle>;
};

/**
 * A sentence with real math notation inside it. Words and math pieces are
 * laid out in a wrapping row on a shared baseline, so fractions and limits
 * read like they would on paper. Screen readers get the whole sentence as text.
 */
export function RichText({ text, math, style }: Props) {
  const flat = StyleSheet.flatten(style);
  const fontSize = flat.fontSize ?? 16;
  const color = typeof flat.color === 'string' ? flat.color : undefined;
  const tokens = richTokens(text);

  // Nothing to render as math: a plain Text wraps and selects best.
  if (!tokens.some((t) => t.kind === 'math' && math?.[t.latex])) {
    return <Text style={style}>{proseText(text)}</Text>;
  }

  const scale = fontSize / RENDERED_SIZE;
  const space = fontSize * 0.28;

  return (
    <View style={styles.row} accessible accessibilityLabel={proseText(text)}>
      {tokens.map((token, i) => {
        const gap = token.spaceAfter ? space : 0;
        if (token.kind === 'text') {
          return (
            <Text key={i} style={[style, { marginRight: gap }]}>
              {token.value}
            </Text>
          );
        }
        const rendered = math?.[token.latex];
        const size = rendered ? svgSize(rendered.svg) : null;
        if (!rendered || !size) {
          return (
            <Text key={i} style={[style, { marginRight: gap }]}>
              {latexToText(token.latex)}
            </Text>
          );
        }
        const width = size.width * scale;
        const height = size.height * scale;
        const depth = rendered.depth * scale;
        // The box ends at the math's baseline so baseline alignment lines it
        // up with the words; the part below the baseline hangs out of it.
        return (
          <View key={i} style={{ width, height: height - depth, marginRight: gap, marginTop: 2, marginBottom: depth + 2, overflow: 'visible' }}>
            <SvgXml xml={rendered.svg} width={width} height={height} color={color} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
});
