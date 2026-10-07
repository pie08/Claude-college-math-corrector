import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { BadImageError, prepareImage } from '../src/image';

/** A page with lines of "handwriting" (thin dark strokes). */
async function page(width: number, height: number): Promise<Buffer> {
  const strokes = Array.from({ length: 20 }, (_, i) => ({
    input: { create: { width: Math.round(width * 0.6), height: 3, channels: 3 as const, background: '#202020' } },
    top: Math.round(height * 0.1 + i * height * 0.04),
    left: Math.round(width * 0.15),
  }));
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(strokes)
    .jpeg()
    .toBuffer();
}

describe('prepareImage', () => {
  it('shrinks large photos to the max edge, keeping the aspect ratio', async () => {
    const out = await prepareImage(await page(4080, 3072), 2048);
    expect(out.width).toBe(2048);
    expect(out.height).toBe(Math.round((3072 * 2048) / 4080));
  });

  it('never enlarges small images', async () => {
    const out = await prepareImage(await page(800, 600), 2048);
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it('scores a blurred copy as much less sharp', async () => {
    const sharpPage = await page(2000, 2600);
    const blurred = await sharp(sharpPage).blur(6).jpeg().toBuffer();
    const a = await prepareImage(sharpPage, 2048);
    const b = await prepareImage(blurred, 2048);
    expect(b.sharpness).toBeLessThan(a.sharpness / 4);
  });

  it('rejects data that is not an image', async () => {
    await expect(prepareImage(Buffer.from('hello'), 2048)).rejects.toBeInstanceOf(BadImageError);
  });
});
