/**
 * Draws stand-in differential-equation test pages (printed questions, work in
 * a handwriting font, known mistakes) until real photographed DE pages exist.
 *
 *   npm --workspace services/api exec tsx scripts/make-de-pages.ts
 *
 * Writes test/fixtures/pages/de/page-0N.jpg (gitignored like all fixtures).
 * The matching key is answers-de.md, written by this script too.
 * Needs the Windows "Ink Free" font; other systems fall back to a default font.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { fixturesDir } from './lib/common';

type Problem = { label: string; question: string; work: string[] };

const PAGES: { file: string; title: string; problems: Problem[] }[] = [
  {
    file: 'de/page-01.jpg',
    title: 'Worksheet 7: First-order differential equations',
    problems: [
      {
        label: '1',
        question: '1. Solve dy/dx = xy.',
        work: ['dy/y = x dx', '∫ dy/y = ∫ x dx', 'ln|y| = x^{2}/2 + C', 'y = e^{x²/2} + C'],
      },
      {
        label: '2',
        question: "2. Solve y' + 2y = 4.",
        work: ['μ = e^{∫2 dx} = e^{2x}', "(y e^{2x})' = 4e^{2x}", 'y e^{2x} = 2e^{2x} + C', 'y = 2 + Ce^{-2x}'],
      },
      {
        label: '3',
        question: "3. Solve y' − y/x = x  for x > 0.",
        work: ['μ = e^{∫ -1/x dx} = x', "(xy)' = x · x = x^{2}", 'xy = x^{3}/3 + C', 'y = x^{2}/3 + C/x'],
      },
      {
        label: '4',
        question: '4. Solve dy/dx = 2x,  y(0) = 3.',
        work: ['y = x^{2} + C', '3 = 0 + C  →  C = 3', 'y = x^{2} + 3'],
      },
    ],
  },
  {
    file: 'de/page-02.jpg',
    title: 'Worksheet 8: Second-order equations and IVPs',
    problems: [
      {
        label: '5',
        question: "5. Find the general solution of y'' − 5y' + 6y = 0.",
        work: ['r^{2} − 5r + 6 = 0', '(r + 2)(r + 3) = 0', 'r = −2, −3', 'y = C₁e^{-2x} + C₂e^{-3x}'],
      },
      {
        label: '6',
        question: "6. Find the general solution of y'' + 4y = 0.",
        work: ['r^{2} + 4 = 0', 'r = ±2i', 'y = C₁cos(2x) + C₂sin(2x)'],
      },
      {
        label: '7',
        question: "7. Solve y' = y,  y(0) = 5.",
        work: ['dy/y = dx', 'ln|y| = x', 'y = e^{x}', 'y(0) = e^{0} = 1'],
      },
      {
        label: '8',
        question: "8. Find the general solution of y'' − y = x.",
        work: ['y_{h} = C₁e^{x} + C₂e^{-x}', "y_{p} = Ax + B,  y_{p}'' = 0", '0 − (Ax + B) = x  →  A = −1, B = 0', 'y = C₁e^{x} + C₂e^{-x} − x'],
      },
    ],
  },
];

const KEY = `# Answer key: DE stand-in worksheets (generated)

Typed pages from scripts/make-de-pages.ts, written in a handwriting font.
Replace or extend with real photographed DE work when available.

### de/page-01.jpg (Worksheet 7)
- 1: wrong at line 4: added the constant after exponentiating → y = Ce^(x²/2)
- 2: correct (y = 2 + Ce^(-2x))
- 3: wrong at line 1: integrating factor sign; ∫ -1/x dx = -ln x so μ = 1/x → y = x² + Cx
- 4: correct (y = x² + 3)

### de/page-02.jpg (Worksheet 8)
- 5: wrong at line 2: factored r² - 5r + 6 as (r+2)(r+3) → (r-2)(r-3), y = C₁e^(2x) + C₂e^(3x); later lines follow from the mistake
- 6: correct (y = C₁cos 2x + C₂sin 2x)
- 7: wrong at line 2: lost the constant of integration → ln|y| = x + C, y = Ce^x, y = 5e^x; later lines follow from the mistake
- 8: correct (y = C₁e^x + C₂e^(-x) - x)
`;

const W = 1700;
const H = 2200;

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Handwritten line: `^{...}` is drawn raised and `_{...}` lowered, both smaller, like written exponents and subscripts. */
function handLine(text: string, x: number, y: number, size: number, tilt: number): string {
  const parts: string[] = [];
  const re = /([_^])\{([^}]*)\}/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    parts.push(`<tspan>${escape(text.slice(last, m.index))}</tspan>`);
    const shift = m[1] === '^' ? -size * 0.4 : size * 0.25;
    parts.push(`<tspan dy="${shift}" font-size="${size * 0.65}">${escape(m[2]!)}</tspan><tspan dy="${-shift}"> </tspan>`);
    last = m.index + m[0].length;
  }
  parts.push(`<tspan>${escape(text.slice(last))}</tspan>`);
  return `<text x="${x}" y="${y}" font-family="Ink Free" font-size="${size}" fill="#1f2a44" transform="rotate(${tilt} ${x} ${y})">${parts.join('')}</text>`;
}

function pageSvg(page: (typeof PAGES)[number], seed: number): string {
  let rand = seed;
  const jitter = () => {
    rand = (rand * 9301 + 49297) % 233280;
    return rand / 233280 - 0.5;
  };
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
    `<rect width="100%" height="100%" fill="#fbfaf6"/>`,
    `<text x="120" y="150" font-family="Times New Roman" font-size="44" font-weight="bold" fill="#111">${escape(page.title)}</text>`,
  ];
  let y = 280;
  for (const problem of page.problems) {
    out.push(`<text x="120" y="${y}" font-family="Times New Roman" font-size="38" fill="#111">${escape(problem.question)}</text>`);
    y += 85;
    for (const line of problem.work) {
      out.push(handLine(line, 190 + jitter() * 30, y, 48, jitter() * 1.5));
      y += 78;
    }
    y += 60;
  }
  out.push(`<text x="${W / 2}" y="${H - 80}" font-family="Times New Roman" font-size="30" fill="#555" text-anchor="middle">Page ${seed}</text>`, '</svg>');
  return out.join('');
}

for (const [i, page] of PAGES.entries()) {
  const target = path.join(fixturesDir, page.file);
  await mkdir(path.dirname(target), { recursive: true });
  // A slight blur and JPEG compression so it looks less like a clean render.
  await sharp(Buffer.from(pageSvg(page, i + 1))).blur(0.6).jpeg({ quality: 82 }).toFile(target);
  console.log(`wrote ${target}`);
}
await writeFile(path.join(fixturesDir, 'answers-de.md'), KEY);
console.log('wrote answers-de.md');
