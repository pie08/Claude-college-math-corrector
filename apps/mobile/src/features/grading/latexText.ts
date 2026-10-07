/**
 * Turns the grader's LaTeX into readable plain text ("\frac{1}{2}" → "1/2").
 * A stopgap until Phase 4 renders real math; anything it doesn't know is
 * left readable rather than dropped.
 */

const SYMBOLS: Record<string, string> = {
  to: '→', rightarrow: '→', Rightarrow: '⇒', implies: '⇒', infty: '∞', cdot: '·', times: '×', div: '÷',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', pm: '±', mp: '∓',
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', lambda: 'λ', mu: 'μ', sigma: 'σ', phi: 'φ', omega: 'ω',
  int: '∫', sum: 'Σ', prod: 'Π', partial: '∂', nabla: '∇', circ: '∘', in: '∈', cup: '∪', cap: '∩',
  sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot', arcsin: 'arcsin', arccos: 'arccos', arctan: 'arctan',
  ln: 'ln', log: 'log', exp: 'exp',
  quad: ' ', qquad: ' ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', '{': '{', '}': '}', '%': '%',
};

const FUNCTION_NAMES = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'exp',
]);

const OPERATORS = new Set([
  'to', 'rightarrow', 'Rightarrow', 'implies', 'cdot', 'times', 'div',
  'le', 'leq', 'ge', 'geq', 'ne', 'neq', 'approx', 'pm', 'mp',
]);

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ',
};

export function latexToText(latex: string): string {
  let i = 0;
  const src = latex;

  // Reads one argument: a {group} or a single token.
  function readArg(): string {
    skipSpaces();
    if (src[i] === '{') {
      i++;
      const out = readUntil('}');
      i++;
      return out;
    }
    if (src[i] === '\\') return readCommand();
    return src[i++] ?? '';
  }

  function skipSpaces() {
    while (src[i] === ' ') i++;
  }

  function readCommand(): string {
    i++; // backslash
    let name = '';
    if (/[a-zA-Z]/.test(src[i] ?? '')) {
      while (/[a-zA-Z]/.test(src[i] ?? '')) name += src[i++];
    } else {
      name = src[i++] ?? '';
    }
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac': {
        const num = readArg();
        const den = readArg();
        return `${wrap(num)}/${wrap(den)}`;
      }
      case 'sqrt': {
        let index = '';
        if (src[i] === '[') {
          i++;
          index = readUntil(']');
          i++;
        }
        const body = readArg();
        return `${index}√${wrap(body)}`;
      }
      case 'text':
      case 'textbf':
      case 'mathrm':
      case 'operatorname':
      case 'mathbf':
        return readArg();
      case 'left':
      case 'right':
      case 'big':
      case 'Big':
      case 'displaystyle':
        return '';
      case 'lim': {
        const sub = src[i] === '_' ? (i++, readArg()) : '';
        return sub ? `lim(${sub}) ` : 'lim ';
      }
      default: {
        const symbol = SYMBOLS[name];
        if (symbol === undefined) return name;
        // Function names like "sin" need a space before their argument;
        // operators get even spacing ("2 · 1", "x ≤ 3").
        if (FUNCTION_NAMES.has(name)) return `${symbol} `;
        return OPERATORS.has(name) ? ` ${symbol} ` : symbol;
      }
    }
  }

  function readUntil(close: string): string {
    let out = '';
    let depth = 0;
    while (i < src.length) {
      const c = src[i]!;
      if (c === close && depth === 0) break;
      if (c === '{') depth++;
      if (c === '}') depth--;
      out += readToken();
    }
    return out;
  }

  function readToken(): string {
    const c = src[i]!;
    if (c === '\\') return readCommand();
    if (c === '^') {
      i++;
      const exp = readArg();
      const sup = [...exp].every((ch) => SUPERSCRIPT[ch]) ? [...exp].map((ch) => SUPERSCRIPT[ch]).join('') : `^(${exp})`;
      return sup;
    }
    if (c === '_') {
      i++;
      return `_${wrap(readArg())}`;
    }
    if (c === '{' || c === '}') {
      i++;
      return '';
    }
    i++;
    return c;
  }

  let out = '';
  while (i < src.length) out += readToken();
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s+([,)])/g, '$1')
    .replace(/\(\s*([^()]*?)\s*→\s*/g, '($1→') // "lim(x → 2)" reads better as "lim(x→2)"
    .trim();
}

/**
 * Cleans prose that may contain inline LaTeX ("it comes out as \sqrt{4}=2")
 * into plain text, leaving ordinary sentences untouched.
 */
export function proseText(text: string): string {
  // `$...$` pieces are LaTeX. Outside them, only real LaTeX (a \command or a
  // ^{...}/_{...} group, from results saved before inline math) is converted;
  // plain math like "4^(1/2)" or "x^2" is already readable and left alone.
  return text
    .split(/(\$[^$]+\$)/)
    .map((part) =>
      /^\$[^$]+\$$/.test(part)
        ? latexToText(part.slice(1, -1).trim())
        : /\\[a-zA-Z]|[\^_]\{/.test(part)
          ? latexToText(part)
          : part,
    )
    .join('');
}

export type RichToken =
  | { kind: 'text'; value: string; spaceAfter: boolean }
  | { kind: 'math'; latex: string; spaceAfter: boolean };

/**
 * Splits a sentence into words and `$...$` math pieces, so they can be laid
 * out side by side and wrap like text. `spaceAfter` says whether whitespace
 * followed the token (so "$x$." keeps the period attached).
 */
export function richTokens(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  const pattern = /\$([^$]+)\$|[^\s$]+|\$/g;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    const spaceAfter = /\s/.test(text[pattern.lastIndex] ?? '');
    if (m[1] !== undefined) tokens.push({ kind: 'math', latex: m[1].trim(), spaceAfter });
    else tokens.push({ kind: 'text', value: proseText(m[0]), spaceAfter });
  }
  return tokens;
}

/** Adds parentheses unless the expression is a single number or symbol. */
function wrap(expr: string): string {
  const t = expr.trim();
  return /^[\w.√π∞]+$/u.test(t) || /^\(.*\)$/.test(t) ? t : `(${t})`;
}
