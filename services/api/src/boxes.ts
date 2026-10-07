import type { BBox, Problem } from '@calc/shared';
import sharp from 'sharp';

import type { PreparedImage } from './image';

/**
 * Snaps the model's boxes to the actual handwriting. The model's boxes are
 * usually in the right place but loose or slightly offset; here we find the
 * ink near each box and fit the box to the handwritten line it overlaps.
 *
 * "Ink" means pixels clearly darker than their local background, which keeps
 * pencil and pen but ignores faint ruled or grid lines and uneven lighting.
 * When anything looks doubtful the model's box is kept.
 */

/** Long edge of the working copy; plenty for line-level boxes and fast. */
const WORK_EDGE = 1024;
/** How much darker than the local background a pixel must be to count as ink (0–255). */
const INK_CONTRAST = 40;

export type InkMap = { width: number; height: number; ink: Uint8Array };

export async function tightenBoxes(problems: Problem[], image: PreparedImage): Promise<Problem[]> {
  if (!problems.some((p) => p.issues.length > 0)) return problems;
  let map: InkMap;
  try {
    map = await inkMap(Buffer.from(image.base64, 'base64'));
  } catch {
    return problems;
  }
  return problems.map((problem) => ({
    ...problem,
    issues: problem.issues.map((issue) => {
      const tight = tightenBox(issue.bbox, map);
      return tight ? { ...issue, bbox: tight, bbox_source: 'ink' as const } : issue;
    }),
  }));
}

export async function inkMap(image: Buffer): Promise<InkMap> {
  const gray = sharp(image).greyscale().resize({ width: WORK_EDGE, height: WORK_EDGE, fit: 'inside' });
  const { data: pixels, info } = await gray.clone().raw().toBuffer({ resolveWithObject: true });
  // A heavy blur estimates the paper's brightness around each pixel.
  const { data: background } = await gray.clone().blur(12).raw().toBuffer({ resolveWithObject: true });
  const ink = new Uint8Array(info.width * info.height);
  for (let i = 0; i < ink.length; i++) ink[i] = background[i]! - pixels[i]! > INK_CONTRAST ? 1 : 0;
  return { width: info.width, height: info.height, ink };
}

/** Returns a tighter box around the handwriting under `box`, or null to keep the original. */
export function tightenBox(box: BBox, map: InkMap): BBox | null {
  const { width: W, height: H, ink } = map;
  const x0 = box.x * W;
  const y0 = box.y * H;
  const x1 = (box.x + box.w) * W;
  const y1 = (box.y + box.h) * H;
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 4 || h < 4) return null;

  // Search a little beyond the model's box, mostly vertically (line height).
  const ex0 = clampInt(x0 - Math.max(0.15 * w, 8), 0, W - 1);
  const ex1 = clampInt(x1 + Math.max(0.15 * w, 8), 0, W - 1);
  const ey0 = clampInt(y0 - Math.max(0.35 * h, 6), 0, H - 1);
  const ey1 = clampInt(y1 + Math.max(0.35 * h, 6), 0, H - 1);

  // Rows with ink, grouped into runs (lines of writing); keep runs that overlap the box.
  const minRowInk = Math.max(2, Math.round((ex1 - ex0) * 0.01));
  const rowHasInk = (y: number) => {
    let n = 0;
    for (let x = ex0; x <= ex1; x++) n += ink[y * W + x]!;
    return n >= minRowInk;
  };
  const rows = runs(ey0, ey1, rowHasInk, 3).filter(([a, b]) => b >= y0 && a <= y1);
  if (rows.length === 0) return null;
  const ny0 = Math.min(...rows.map((r) => r[0]));
  const ny1 = Math.max(...rows.map((r) => r[1]));

  // Columns with ink inside those rows, grouped with word-sized gaps; keep runs that overlap the box.
  const colHasInk = (x: number) => {
    for (let y = ny0; y <= ny1; y++) if (ink[y * W + x]) return true;
    return false;
  };
  const cols = runs(ex0, ex1, colHasInk, 14).filter(([a, b]) => b >= x0 && a <= x1);
  if (cols.length === 0) return null;
  const nx0 = Math.min(...cols.map((c) => c[0]));
  const nx1 = Math.max(...cols.map((c) => c[1]));

  // Small padding so the outline doesn't touch the strokes.
  const pad = 3;
  const tx0 = Math.max(0, nx0 - pad);
  const ty0 = Math.max(0, ny0 - pad);
  const tx1 = Math.min(W, nx1 + 1 + pad);
  const ty1 = Math.min(H, ny1 + 1 + pad);

  // Sanity: the result must still be mostly the model's box, not something else nearby.
  const interW = Math.max(0, Math.min(x1, tx1) - Math.max(x0, tx0));
  const interH = Math.max(0, Math.min(y1, ty1) - Math.max(y0, ty0));
  const inter = interW * interH;
  const union = w * h + (tx1 - tx0) * (ty1 - ty0) - inter;
  if (union <= 0 || inter / union < 0.35) return null;
  if ((ty1 - ty0) > h * 1.8 || (tx1 - tx0) > w * 1.4) return null;

  return {
    x: round(tx0 / W),
    y: round(ty0 / H),
    w: round((tx1 - tx0) / W),
    h: round((ty1 - ty0) / H),
  };
}

/** Contiguous [start, end] ranges where `has` is true, bridging gaps up to `maxGap`. */
function runs(from: number, to: number, has: (i: number) => boolean, maxGap: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let last = -1;
  for (let i = from; i <= to; i++) {
    if (!has(i)) continue;
    if (start === -1) start = i;
    else if (i - last > maxGap + 1) {
      out.push([start, last]);
      start = i;
    }
    last = i;
  }
  if (start !== -1) out.push([start, last]);
  return out;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(v, min), max));
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
