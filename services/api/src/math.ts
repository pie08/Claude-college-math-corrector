import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';

/**
 * Renders LaTeX to a self-contained SVG string with MathJax, so the phone can
 * draw real math notation (stacked fractions, exponents, limits) without a
 * WebView. Done on the server once per result; the phone stores the SVG.
 */

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const doc = mathjax.document('', {
  InputJax: new TeX({
    packages: AllPackages.filter((p: string) => p !== 'bussproofs'),
    // Throw on bad LaTeX instead of rendering a red error box.
    formatError: (_jax: unknown, error: Error) => {
      throw error;
    },
  }),
  // Inline every glyph path: react-native-svg can't follow <use> references.
  OutputJax: new SVG({ fontCache: 'none' }),
});

/**
 * Returns an SVG string sized in pixels for `fontSize`, with `currentColor`
 * fills so the app can color it. Returns null when the LaTeX can't be parsed;
 * the app then shows the text version instead.
 */
export function renderMathSvg(latex: string, fontSize = 18): string | null {
  if (!latex.trim()) return null;
  try {
    const node = doc.convert(latex, { display: true });
    const svgNode = adaptor.firstChild(node) as Parameters<typeof adaptor.outerHTML>[0];
    let svg = adaptor.outerHTML(svgNode);
    // MathJax sizes in "ex"; react-native-svg needs numbers. 1ex ≈ 0.442em.
    const exPx = fontSize * 0.442;
    svg = svg.replace(/(width|height)="([\d.]+)ex"/g, (_m, attr: string, value: string) => `${attr}="${(Number(value) * exPx).toFixed(1)}"`);
    // Drop attributes react-native-svg doesn't understand.
    svg = svg
      .replace(/\s(style|role|focusable|aria-hidden|xmlns:xlink|data-[\w-]+)="[^"]*"/g, '')
      .replace(/\s+/g, ' ');
    return svg;
  } catch {
    return null;
  }
}
