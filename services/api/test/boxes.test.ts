import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { inkMap, tightenBox, type InkMap } from '../src/boxes';

/**
 * A 1000x1000 "page": faint grid lines every 40px (like graph paper) and two
 * dark handwriting lines: line A at y 300–330 (x 200–600), line B at y 380–410.
 */
let map: InkMap;
beforeAll(async () => {
  const grid = [];
  for (let i = 0; i < 1000; i += 40) {
    grid.push({ input: { create: { width: 1000, height: 1, channels: 3 as const, background: '#dde4ee' } }, top: i, left: 0 });
    grid.push({ input: { create: { width: 1, height: 1000, channels: 3 as const, background: '#dde4ee' } }, top: 0, left: i });
  }
  const strokes = [
    { input: { create: { width: 400, height: 30, channels: 3 as const, background: '#333333' } }, top: 300, left: 200 },
    { input: { create: { width: 300, height: 30, channels: 3 as const, background: '#333333' } }, top: 380, left: 250 },
  ];
  const page = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#ffffff' } })
    .composite([...grid, ...strokes])
    .jpeg()
    .toBuffer();
  map = await inkMap(page);
});

const near = (a: number, b: number, tol = 0.012) => Math.abs(a - b) <= tol;

describe('tightenBox', () => {
  it('fits a loose, offset box to the handwriting line it overlaps, ignoring grid lines', () => {
    // Model box: roughly line A, too wide and shifted down a bit.
    const tight = tightenBox({ x: 0.17, y: 0.29, w: 0.47, h: 0.06 }, map)!;
    expect(tight).not.toBeNull();
    expect(near(tight.x, 0.2)).toBe(true);
    expect(near(tight.y, 0.3)).toBe(true);
    expect(near(tight.x + tight.w, 0.6)).toBe(true);
    expect(near(tight.y + tight.h, 0.33)).toBe(true);
  });

  it('does not swallow the next line of writing', () => {
    const tight = tightenBox({ x: 0.2, y: 0.295, w: 0.4, h: 0.045 }, map)!;
    expect(tight.y + tight.h).toBeLessThan(0.36);
  });

  it('keeps the model box when there is no ink under it', () => {
    expect(tightenBox({ x: 0.7, y: 0.7, w: 0.1, h: 0.05 }, map)).toBeNull();
  });
});
