/**
 * Pure geometry for the crop/rotate screen.
 *
 * Crop rectangles are stored normalized (0–1) relative to the *rotated*
 * image, so they survive preview resizing and map cleanly onto the
 * full-resolution original at export time.
 *
 * Functions marked 'worklet' also run on the UI thread during drag gestures.
 */

export type Size = { width: number; height: number };

export type NormalizedRect = { x: number; y: number; width: number; height: number };

/** Crop frame position in display pixels, as distances from the top-left corner. */
export type Edges = { left: number; top: number; right: number; bottom: number };

export type PixelRect = { originX: number; originY: number; width: number; height: number };

export type QuarterTurns = 0 | 1 | 2 | 3;

/** Which edges a drag handle moves. `move` drags the whole frame. */
export type CropHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'top' | 'bottom' | 'left' | 'right' | 'move';

export const FULL_RECT: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Wraps any number of clockwise quarter turns into 0–3 (negative = counter-clockwise). */
export function normalizeQuarterTurns(turns: number): QuarterTurns {
  return (((turns % 4) + 4) % 4) as QuarterTurns;
}

/** Image dimensions after rotating by the given quarter turns. */
export function rotatedSize(size: Size, turns: QuarterTurns): Size {
  return turns % 2 === 1 ? { width: size.height, height: size.width } : size;
}

/** Largest size with the same aspect ratio as `content` that fits inside `container`. */
export function fitContain(content: Size, container: Size): Size {
  if (content.width <= 0 || content.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(container.width / content.width, container.height / content.height);
  return { width: content.width * scale, height: content.height * scale };
}

/**
 * Scales `size` down so its long edge is at most `maxLongEdge`.
 * Never upscales. Results are rounded to whole pixels.
 */
export function scaleToLongEdge(size: Size, maxLongEdge: number): Size {
  const longEdge = Math.max(size.width, size.height);
  if (longEdge <= maxLongEdge) return { width: Math.round(size.width), height: Math.round(size.height) };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * Re-expresses a normalized rect after rotating the image clockwise by
 * `turns` quarter turns, so the user's crop follows the image.
 *
 * A point (u, v) in the old image lands at (1 - v, u) after one clockwise turn.
 */
export function rotateRectClockwise(rect: NormalizedRect, turns: number): NormalizedRect {
  let r = rect;
  for (let i = 0; i < normalizeQuarterTurns(turns); i++) {
    r = { x: 1 - (r.y + r.height), y: r.x, width: r.height, height: r.width };
  }
  return r;
}

/**
 * Converts a normalized rect to a whole-pixel crop rect inside an image of
 * `size`, clamped to the image bounds and at least 1px in each dimension.
 */
export function toPixelRect(rect: NormalizedRect, size: Size): PixelRect {
  const left = clamp(Math.round(rect.x * size.width), 0, size.width - 1);
  const top = clamp(Math.round(rect.y * size.height), 0, size.height - 1);
  const right = clamp(Math.round((rect.x + rect.width) * size.width), left + 1, size.width);
  const bottom = clamp(Math.round((rect.y + rect.height) * size.height), top + 1, size.height);
  return { originX: left, originY: top, width: right - left, height: bottom - top };
}

/** True when the rect covers (almost) the whole image, so no crop is needed. */
export function isFullRect(rect: NormalizedRect, tolerance = 0.002): boolean {
  return (
    rect.x <= tolerance &&
    rect.y <= tolerance &&
    rect.x + rect.width >= 1 - tolerance &&
    rect.y + rect.height >= 1 - tolerance
  );
}

export function normalizedToEdges(rect: NormalizedRect, bounds: Size): Edges {
  'worklet';
  return {
    left: rect.x * bounds.width,
    top: rect.y * bounds.height,
    right: (rect.x + rect.width) * bounds.width,
    bottom: (rect.y + rect.height) * bounds.height,
  };
}

export function edgesToNormalized(edges: Edges, bounds: Size): NormalizedRect {
  'worklet';
  return {
    x: edges.left / bounds.width,
    y: edges.top / bounds.height,
    width: (edges.right - edges.left) / bounds.width,
    height: (edges.bottom - edges.top) / bounds.height,
  };
}

/**
 * New frame edges after dragging `handle` by (dx, dy) from `start`.
 * Keeps the frame inside `bounds` and at least `minSize` on each side
 * (or the full bounds, if those are smaller than `minSize`).
 */
export function dragEdges(
  start: Edges,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: Size,
  minSize: number,
): Edges {
  'worklet';
  const minW = Math.min(minSize, bounds.width);
  const minH = Math.min(minSize, bounds.height);

  if (handle === 'move') {
    const w = start.right - start.left;
    const h = start.bottom - start.top;
    const left = clamp(start.left + dx, 0, bounds.width - w);
    const top = clamp(start.top + dy, 0, bounds.height - h);
    return { left, top, right: left + w, bottom: top + h };
  }

  const movesLeft = handle === 'left' || handle === 'topLeft' || handle === 'bottomLeft';
  const movesRight = handle === 'right' || handle === 'topRight' || handle === 'bottomRight';
  const movesTop = handle === 'top' || handle === 'topLeft' || handle === 'topRight';
  const movesBottom = handle === 'bottom' || handle === 'bottomLeft' || handle === 'bottomRight';

  let { left, top, right, bottom } = start;
  if (movesLeft) left = clamp(start.left + dx, 0, start.right - minW);
  if (movesRight) right = clamp(start.right + dx, start.left + minW, bounds.width);
  if (movesTop) top = clamp(start.top + dy, 0, start.bottom - minH);
  if (movesBottom) bottom = clamp(start.bottom + dy, start.top + minH, bounds.height);
  return { left, top, right, bottom };
}
