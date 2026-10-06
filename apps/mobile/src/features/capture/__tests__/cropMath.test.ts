import { describe, expect, it } from '@jest/globals';

import {
  FULL_RECT,
  dragEdges,
  edgesToNormalized,
  fitContain,
  isFullRect,
  normalizeQuarterTurns,
  normalizedToEdges,
  rotateRectClockwise,
  rotatedSize,
  scaleToLongEdge,
  toPixelRect,
  type Edges,
  type NormalizedRect,
} from '../cropMath';

function expectRectClose(actual: NormalizedRect, expected: NormalizedRect) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
}

describe('normalizeQuarterTurns', () => {
  it('wraps positive and negative turns into 0–3', () => {
    expect(normalizeQuarterTurns(0)).toBe(0);
    expect(normalizeQuarterTurns(5)).toBe(1);
    expect(normalizeQuarterTurns(-1)).toBe(3);
    expect(normalizeQuarterTurns(-4)).toBe(0);
  });
});

describe('rotatedSize', () => {
  it('swaps dimensions on odd quarter turns only', () => {
    const size = { width: 4000, height: 3000 };
    expect(rotatedSize(size, 0)).toEqual(size);
    expect(rotatedSize(size, 1)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize(size, 2)).toEqual(size);
    expect(rotatedSize(size, 3)).toEqual({ width: 3000, height: 4000 });
  });
});

describe('fitContain', () => {
  it('fits a tall image by height', () => {
    expect(fitContain({ width: 1000, height: 2000 }, { width: 400, height: 400 })).toEqual({ width: 200, height: 400 });
  });

  it('fits a wide image by width', () => {
    expect(fitContain({ width: 2000, height: 1000 }, { width: 400, height: 400 })).toEqual({ width: 400, height: 200 });
  });

  it('returns zero size for an empty image', () => {
    expect(fitContain({ width: 0, height: 100 }, { width: 400, height: 400 })).toEqual({ width: 0, height: 0 });
  });
});

describe('scaleToLongEdge', () => {
  it('scales the long edge down to the limit and keeps the aspect ratio', () => {
    expect(scaleToLongEdge({ width: 3024, height: 4032 }, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('never upscales', () => {
    expect(scaleToLongEdge({ width: 800, height: 600 }, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe('rotateRectClockwise', () => {
  const rect: NormalizedRect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

  it('moves a rect with the image on one clockwise turn', () => {
    // Top-left (0.1, 0.2) → (1 - 0.2 - 0.4, 0.1); the sides swap.
    expectRectClose(rotateRectClockwise(rect, 1), { x: 0.4, y: 0.1, width: 0.4, height: 0.3 });
  });

  it('returns the original rect after four turns', () => {
    expectRectClose(rotateRectClockwise(rect, 4), rect);
  });

  it('undoes a clockwise turn with a counter-clockwise one', () => {
    expectRectClose(rotateRectClockwise(rotateRectClockwise(rect, 1), -1), rect);
  });

  it('keeps the full rect full', () => {
    expectRectClose(rotateRectClockwise(FULL_RECT, 1), FULL_RECT);
  });
});

describe('toPixelRect', () => {
  it('converts to whole pixels', () => {
    expect(toPixelRect({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, { width: 1000, height: 800 })).toEqual({
      originX: 250,
      originY: 400,
      width: 500,
      height: 200,
    });
  });

  it('clamps rects that spill past the image', () => {
    expect(toPixelRect({ x: -0.1, y: 0.9, width: 1.5, height: 0.5 }, { width: 100, height: 100 })).toEqual({
      originX: 0,
      originY: 90,
      width: 100,
      height: 10,
    });
  });

  it('never returns an empty rect', () => {
    const pixel = toPixelRect({ x: 1, y: 1, width: 0, height: 0 }, { width: 100, height: 100 });
    expect(pixel.width).toBeGreaterThanOrEqual(1);
    expect(pixel.height).toBeGreaterThanOrEqual(1);
    expect(pixel.originX + pixel.width).toBeLessThanOrEqual(100);
    expect(pixel.originY + pixel.height).toBeLessThanOrEqual(100);
  });
});

describe('isFullRect', () => {
  it('detects the full image, allowing for float error', () => {
    expect(isFullRect(FULL_RECT)).toBe(true);
    expect(isFullRect({ x: 0.0001, y: 0, width: 0.9999, height: 1 })).toBe(true);
    expect(isFullRect({ x: 0.1, y: 0, width: 0.9, height: 1 })).toBe(false);
  });
});

describe('normalized ↔ edges', () => {
  it('round-trips', () => {
    const bounds = { width: 300, height: 500 };
    const rect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
    expectRectClose(edgesToNormalized(normalizedToEdges(rect, bounds), bounds), rect);
  });
});

describe('dragEdges', () => {
  const bounds = { width: 300, height: 400 };
  const start: Edges = { left: 50, top: 50, right: 250, bottom: 350 };
  const MIN = 56;

  it('moves only the dragged corner', () => {
    expect(dragEdges(start, 'topLeft', 10, 20, bounds, MIN)).toEqual({ left: 60, top: 70, right: 250, bottom: 350 });
    expect(dragEdges(start, 'bottomRight', -10, -20, bounds, MIN)).toEqual({ left: 50, top: 50, right: 240, bottom: 330 });
  });

  it('moves only the dragged side', () => {
    expect(dragEdges(start, 'top', 30, 15, bounds, MIN)).toEqual({ ...start, top: 65 });
    expect(dragEdges(start, 'right', 15, 30, bounds, MIN)).toEqual({ ...start, right: 265 });
  });

  it('keeps the frame inside the image', () => {
    expect(dragEdges(start, 'topLeft', -500, -500, bounds, MIN)).toEqual({ left: 0, top: 0, right: 250, bottom: 350 });
    expect(dragEdges(start, 'bottomRight', 500, 500, bounds, MIN)).toEqual({ left: 50, top: 50, right: 300, bottom: 400 });
  });

  it('enforces the minimum frame size', () => {
    const squeezed = dragEdges(start, 'topLeft', 1000, 1000, bounds, MIN);
    expect(squeezed.right - squeezed.left).toBe(MIN);
    expect(squeezed.bottom - squeezed.top).toBe(MIN);
  });

  it('caps the minimum size at the image size', () => {
    const tiny = { width: 40, height: 40 };
    const result = dragEdges({ left: 0, top: 0, right: 40, bottom: 40 }, 'bottomRight', -100, -100, tiny, MIN);
    expect(result).toEqual({ left: 0, top: 0, right: 40, bottom: 40 });
  });

  it('moves the whole frame without resizing it, stopping at the edges', () => {
    expect(dragEdges(start, 'move', 20, -10, bounds, MIN)).toEqual({ left: 70, top: 40, right: 270, bottom: 340 });
    expect(dragEdges(start, 'move', 500, 500, bounds, MIN)).toEqual({ left: 100, top: 100, right: 300, bottom: 400 });
  });
});
