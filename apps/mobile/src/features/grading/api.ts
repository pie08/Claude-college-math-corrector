import { GradeEventSchema, GradeResultSchema, type GradeErrorCode, type GradeResult, type GradeStage } from '@calc/shared';
import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { apiConfig } from '@/config';

import { buildMultipartBody, type MultipartPart } from './multipart';
import { createSseParser } from './sse';

export type GradingProgress = { stage: GradeStage | 'uploading'; message: string; problemsFound?: number };

export type GradingErrorCode = GradeErrorCode | 'network' | 'config' | 'cancelled';

export class GradingError extends Error {
  constructor(
    readonly code: GradingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Uploads a page to the grading server and resolves with the result,
 * reporting progress as the server streams events. The photo itself is never
 * stored by the server.
 */
export async function gradePage(
  imageUri: string,
  opts: { onProgress?: (p: GradingProgress) => void; signal?: AbortSignal; unit?: string } = {},
): Promise<GradeResult> {
  if (!apiConfig.secret) {
    throw new GradingError('config', 'The app has no server secret. Set EXPO_PUBLIC_API_SECRET in apps/mobile/.env and restart the dev server.');
  }

  opts.onProgress?.({ stage: 'uploading', message: 'Uploading your page' });

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await new File(imageUri).arrayBuffer());
  } catch (error) {
    if (__DEV__) console.warn('Reading the photo failed:', error);
    throw new GradingError('bad_image', "Couldn't read the photo on this phone. Try taking it again.");
  }
  const parts: MultipartPart[] = [{ name: 'image', filename: 'page.jpg', contentType: 'image/jpeg', bytes }];
  if (opts.unit) parts.push({ name: 'unit', value: opts.unit });
  const { body, contentType } = buildMultipartBody(parts);

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${apiConfig.url}/v1/grade`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiConfig.secret}`,
        accept: 'text/event-stream',
        'content-type': contentType,
      },
      body,
      signal: opts.signal,
    });
  } catch (error) {
    if (opts.signal?.aborted) throw new GradingError('cancelled', 'Cancelled.');
    if (__DEV__) console.warn('Grading upload failed:', error);
    throw new GradingError('network', `Couldn't reach the grading server at ${apiConfig.url}.`);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: GradeErrorCode; message?: string } } | null;
    throw new GradingError(body?.error?.code ?? 'grading_failed', body?.error?.message ?? `Server error ${response.status}.`);
  }
  if (!response.body) throw new GradingError('grading_failed', 'The server sent an empty response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const data of parser.push(decoder.decode(value, { stream: true }))) {
        const parsed = GradeEventSchema.safeParse(JSON.parse(data));
        if (!parsed.success) continue;
        const event = parsed.data;
        if (event.type === 'progress') {
          opts.onProgress?.({ stage: event.stage, message: event.message, problemsFound: event.problems_found });
        } else if (event.type === 'result') {
          return GradeResultSchema.parse(event.result);
        } else {
          throw new GradingError(event.code, event.message);
        }
      }
    }
  } catch (error) {
    if (error instanceof GradingError) throw error;
    if (opts.signal?.aborted) throw new GradingError('cancelled', 'Cancelled.');
    throw new GradingError('network', 'The connection to the grading server dropped.');
  } finally {
    reader.releaseLock();
  }
  throw new GradingError('grading_failed', 'The server stopped before sending a result.');
}

/** What to tell the student for each failure, and whether retrying could help. */
export function describeGradingError(error: GradingError): { title: string; body: string; canRetry: boolean } {
  switch (error.code) {
    case 'network':
      return {
        title: "Can't reach the grading server",
        body: `${error.message} Check that it's running (npm run api) and, over USB, that "adb reverse tcp:8787 tcp:8787" is set.`,
        canRetry: true,
      };
    case 'unauthorized':
      return { title: 'Server rejected the app', body: "The app's secret doesn't match the server's API_SHARED_SECRET.", canRetry: false };
    case 'rate_limited':
      return { title: 'Daily limit reached', body: error.message, canRetry: false };
    case 'too_blurry':
      return { title: 'Photo is too blurry', body: error.message, canRetry: false };
    case 'bad_image':
      return { title: "Couldn't read that photo", body: error.message, canRetry: false };
    case 'model_refused':
      return { title: "This page couldn't be graded", body: error.message, canRetry: true };
    case 'config':
      return { title: 'App not set up', body: error.message, canRetry: false };
    default:
      return { title: 'Grading failed', body: error.message, canRetry: true };
  }
}
