import { describe, expect, it } from 'vitest';

import { collectInlineMath, renderInlineMath, renderMathSvg } from '../src/math';

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

describe('inline math', () => {
  it('renders each $...$ piece once, with its depth below the baseline', () => {
    const math = collectInlineMath([String.raw`You wrote $8(f(x)-g(x))$, not $\frac{1}{x}$.`, String.raw`Again $\frac{1}{x}$`, null]);
    expect(Object.keys(math)).toEqual(['8(f(x)-g(x))', String.raw`\frac{1}{x}`]);
    expect(math[String.raw`\frac{1}{x}`]!.depth).toBeGreaterThan(0);
    expect(math['8(f(x)-g(x))']!.svg).toMatch(/^<svg /);
  });

  it('skips LaTeX that does not parse', () => {
    expect(renderInlineMath(String.raw`\frac{1}`)).toBeNull();
    expect(collectInlineMath(['no math here', 'costs $5'])).toEqual({});
  });
});
