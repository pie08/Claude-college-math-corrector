import { describe, expect, it } from 'vitest';

import { renderMathSvg } from '../src/math';

describe('renderMathSvg', () => {
  it('renders LaTeX to a pixel-sized SVG with only elements react-native-svg supports', () => {
    const svg = renderMathSvg('4\\lim_{x\\to 0}\\left(\\frac{\\sin x}{x}\\right)^{1/2}\\sqrt{x+6}')!;
    expect(svg).toMatch(/^<svg [^>]*width="[\d.]+" height="[\d.]+" viewBox="[^"]+"/);
    const tags = new Set([...svg.matchAll(/<(\w+)/g)].map((m) => m[1]));
    expect([...tags].every((t) => ['svg', 'g', 'path', 'rect'].includes(t!))).toBe(true);
    expect(svg).not.toMatch(/ex"|style=|<use/);
  });

  it('scales with the font size', () => {
    const width = (s: string) => Number(/width="([\d.]+)"/.exec(s)![1]);
    expect(width(renderMathSvg('x^2', 36)!)).toBeCloseTo(width(renderMathSvg('x^2', 18)!) * 2, 0);
  });

  it('returns null for LaTeX it cannot parse, or empty input', () => {
    expect(renderMathSvg('\\frac{1}{')).toBeNull();
    expect(renderMathSvg('  ')).toBeNull();
  });
});
