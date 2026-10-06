import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { imageConfig } from '@/config';

import {
  isFullRect,
  rotatedSize,
  scaleToLongEdge,
  toPixelRect,
  type NormalizedRect,
  type QuarterTurns,
  type Size,
} from './cropMath';

export type ImageInfo = Size & { uri: string };

/**
 * Decodes the captured image and makes a small preview for the crop screen.
 *
 * Dimensions come from the manipulator's own decode (which applies EXIF
 * orientation), so the preview and the final export always agree on which
 * way is up.
 */
export async function preparePreview(sourceUri: string): Promise<{ source: ImageInfo; preview: ImageInfo }> {
  const full = await ImageManipulator.manipulate(sourceUri).renderAsync();
  try {
    const source: ImageInfo = { uri: sourceUri, width: full.width, height: full.height };
    const previewRef = await ImageManipulator.manipulate(full)
      .resize(longEdgeResize(source, imageConfig.previewLongEdge))
      .renderAsync();
    try {
      const preview = await previewRef.saveAsync({
        compress: imageConfig.previewJpegQuality,
        format: SaveFormat.JPEG,
      });
      return { source, preview };
    } finally {
      previewRef.release();
    }
  } finally {
    // Full-resolution bitmaps are large; free them as soon as we're done.
    full.release();
  }
}

/** Rotates the (unrotated) base preview clockwise by `turns` quarter turns. */
export async function rotatePreview(basePreview: ImageInfo, turns: QuarterTurns): Promise<ImageInfo> {
  if (turns === 0) return basePreview;
  const ref = await ImageManipulator.manipulate(basePreview.uri).rotate(turns * 90).renderAsync();
  try {
    return await ref.saveAsync({ compress: imageConfig.previewJpegQuality, format: SaveFormat.JPEG });
  } finally {
    ref.release();
  }
}

/**
 * Applies rotation and crop to the full-resolution original in one pass,
 * then downsizes to the upload size. The result is the image that will be
 * stored on device and sent for grading, so highlight coordinates computed
 * on it map 1:1 onto what the student sees.
 */
export async function exportCrop(source: ImageInfo, turns: QuarterTurns, rect: NormalizedRect): Promise<ImageInfo> {
  let context = ImageManipulator.manipulate(source.uri);
  if (turns !== 0) context = context.rotate(turns * 90);

  const rotated = rotatedSize(source, turns);
  let outputSize: Size = rotated;
  if (!isFullRect(rect)) {
    const crop = toPixelRect(rect, rotated);
    context = context.crop(crop);
    outputSize = crop;
  }

  if (Math.max(outputSize.width, outputSize.height) > imageConfig.maxUploadLongEdge) {
    context = context.resize(longEdgeResize(outputSize, imageConfig.maxUploadLongEdge));
  }

  const ref = await context.renderAsync();
  try {
    return await ref.saveAsync({ compress: imageConfig.uploadJpegQuality, format: SaveFormat.JPEG });
  } finally {
    ref.release();
  }
}

/** Resize argument that pins only the long edge, so the manipulator keeps the exact aspect ratio. */
function longEdgeResize(size: Size, maxLongEdge: number): { width?: number; height?: number } {
  const target = scaleToLongEdge(size, maxLongEdge);
  return size.width >= size.height ? { width: target.width } : { height: target.height };
}
