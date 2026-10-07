import sharp from 'sharp';

export type PreparedImage = {
  /** JPEG bytes, base64-encoded, as sent to the model. */
  base64: string;
  width: number;
  height: number;
  /** Variance of the Laplacian on a downscaled grayscale copy. Higher is sharper. */
  sharpness: number;
};

export class BadImageError extends Error {}

/**
 * Normalizes an uploaded photo for grading: applies EXIF rotation, shrinks it
 * so the long edge is at most `maxEdge`, and re-encodes as JPEG. Highlight
 * boxes are normalized to this image, so they line up with the original too
 * (same crop and aspect ratio).
 */
export async function prepareImage(input: Buffer, maxEdge: number): Promise<PreparedImage> {
  const pipeline = sharp(input, { failOn: 'error' }).rotate();
  try {
    await pipeline.metadata();
  } catch {
    throw new BadImageError("That file isn't an image we can read.");
  }

  const { data, info } = await pipeline
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });

  return {
    base64: data.toString('base64'),
    width: info.width,
    height: info.height,
    sharpness: await measureSharpness(data),
  };
}

/**
 * Blur check: variance of the Laplacian (an edge detector). Sharp handwriting
 * has strong edges and a high variance; a blurry photo scores low. Measured at
 * a fixed size so scores are comparable across cameras.
 */
export async function measureSharpness(image: Buffer): Promise<number> {
  const { data } = await sharp(image)
    .greyscale()
    .resize({ width: 1024, height: 1024, fit: 'inside' })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let sumSq = 0;
  for (const v of data) {
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / data.length;
  return Math.round((sumSq / data.length - mean * mean) * 10) / 10;
}
