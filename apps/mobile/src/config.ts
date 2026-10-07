/**
 * App-wide tunables. Image sizes trade legibility of handwriting against
 * upload time and model latency, and will be tuned against real pages in
 * Phase 2.
 */
export const imageConfig = {
  /** Long edge of the final image that's stored and sent for grading. */
  maxUploadLongEdge: 2048,
  /** JPEG quality (0–1) of the final image. */
  uploadJpegQuality: 0.85,
  /** Long edge of the lightweight preview shown on the crop screen. */
  previewLongEdge: 1600,
  /** JPEG quality (0–1) of crop-screen previews. */
  previewJpegQuality: 0.9,
} as const;

/**
 * Grading server. Set in apps/mobile/.env (see .env.example); Expo inlines
 * EXPO_PUBLIC_ variables when bundling.
 */
export const apiConfig = {
  url: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/+$/, ''),
  secret: process.env.EXPO_PUBLIC_API_SECRET ?? '',
} as const;
