import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Loads the repo-root `.env` (gitignored) once. Real env vars win over the file. */
export function loadEnv(): void {
  const file = path.join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export type GraderConfig = {
  model: string;
  effort: Effort;
  /** Re-run a safety-declined request on Anthropic's recommended fallback model. */
  refusalFallback: boolean;
  /** Long edge of the image sent to the model, in pixels. */
  maxImageEdge: number;
  /** Pages scoring below this sharpness are rejected before calling the model (0 = off). */
  minSharpness: number;
};

export type ServerConfig = GraderConfig & {
  port: number;
  /** Shared secret the app sends as `Authorization: Bearer <secret>`. */
  sharedSecret: string | undefined;
  /** Grading requests allowed per UTC day, across all clients. */
  dailyLimit: number;
  maxUploadBytes: number;
};

export function graderConfig(env: NodeJS.ProcessEnv = process.env): GraderConfig {
  const effort = (env.ANTHROPIC_EFFORT ?? 'high') as Effort;
  if (!EFFORTS.includes(effort)) throw new Error(`ANTHROPIC_EFFORT must be one of ${EFFORTS.join(', ')}`);
  return {
    model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
    effort,
    refusalFallback: env.REFUSAL_FALLBACK !== 'off',
    maxImageEdge: Number(env.MAX_IMAGE_EDGE ?? 2048),
    minSharpness: Number(env.MIN_SHARPNESS ?? 0),
  };
}

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    ...graderConfig(env),
    port: Number(env.PORT ?? 8787),
    sharedSecret: env.API_SHARED_SECRET || undefined,
    dailyLimit: Number(env.DAILY_REQUEST_LIMIT ?? 100),
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024),
  };
}
