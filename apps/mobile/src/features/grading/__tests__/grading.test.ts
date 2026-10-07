import { describe, expect, it } from '@jest/globals';

import { latexToText, proseText } from '../latexText';
import { buildMultipartBody } from '../multipart';
import { createSseParser } from '../sse';

describe('buildMultipartBody', () => {
  it('encodes text and file parts with the boundary', () => {
    const { body, contentType } = buildMultipartBody(
      [
        { name: 'unit', value: 'Limits' },
        { name: 'image', filename: 'page.jpg', contentType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) },
      ],
      'XYZ',
    );
    expect(contentType).toBe('multipart/form-data; boundary=XYZ');
    const text = Buffer.from(body).toString('latin1');
    expect(text).toBe(
      '--XYZ\r\nContent-Disposition: form-data; name="unit"\r\n\r\nLimits\r\n' +
        '--XYZ\r\nContent-Disposition: form-data; name="image"; filename="page.jpg"\r\nContent-Type: image/jpeg\r\n\r\n\u0001\u0002\u0003\r\n' +
        '--XYZ--\r\n',
    );
  });
});

describe('createSseParser', () => {
  it('returns complete events and keeps partial ones for later', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a":1}\n\nda')).toEqual(['{"a":1}']);
    expect(parser.push('ta: {"b":2}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual(['{"b":2}']);
  });

  it('handles CRLF line endings and multiple events per chunk', () => {
    const parser = createSseParser();
    expect(parser.push('data: 1\r\n\r\ndata: 2\r\n\r\n')).toEqual(['1', '2']);
  });

  it('ignores comments and other fields', () => {
    const parser = createSseParser();
    expect(parser.push(': keep-alive\n\nevent: message\ndata: x\n\n')).toEqual(['x']);
  });
});

describe('latexToText', () => {
  it.each([
    ['\\frac{1}{32}', '1/32'],
    ['\\frac{2h+7}{h-1}', '(2h+7)/(h-1)'],
    ['\\lim_{x\\to 2} f(x)', 'lim(x→2) f(x)'],
    ['x^2 + 3x^{3}', 'x² + 3x³'],
    ['e^{x^2}', 'e^(x²)'],
    ['\\sqrt{x+6} - 3', '√(x+6) - 3'],
    ['2\\left(-3\\right)+6 = 0', '2(-3)+6 = 0'],
    ['\\sin x \\cdot \\cos x', 'sin x · cos x'],
    ['y = -3x + 2\\ \\text{(line)}', 'y = -3x + 2 (line)'],
    ['f(x) \\ne f(1)', 'f(x) ≠ f(1)'],
  ])('%s → %s', (latex, text) => {
    expect(latexToText(latex)).toBe(text);
  });

  it('cleans inline LaTeX in prose and leaves plain sentences alone', () => {
    expect(proseText('It has to come out as \\sqrt{4}=2, not 4.')).toBe('It has to come out as √4=2, not 4.');
    expect(proseText('With 2 it becomes 2\\cdot 1\\cdot(-3)=-6.')).toBe('With 2 it becomes 2 · 1 · (-3)=-6.');
    expect(proseText('Nice work on 2c.  Keep going.')).toBe('Nice work on 2c.  Keep going.');
  });

  it('keeps unknown commands readable instead of dropping them', () => {
    expect(latexToText('\\foo{x}')).toBe('foox');
  });
});
