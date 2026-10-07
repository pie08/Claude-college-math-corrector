import { TutorResultSchema, type GradeErrorCode, type TutorContext, type TutorResult } from '@calc/shared';
import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { apiConfig } from '@/config';
import { GRADING_TIMEOUT_MS, GradingError } from '@/features/grading/api';
import { buildMultipartBody, type MultipartPart } from '@/features/grading/multipart';

/** Asks the server to work out one problem on a saved page, step by step. */
export async function requestSolution(
  imageUri: string,
  context: TutorContext,
  opts: { unit?: string; signal?: AbortSignal } = {},
): Promise<TutorResult> {
  if (!apiConfig.secret) throw new GradingError('config', 'The app has no server secret. Set EXPO_PUBLIC_API_SECRET in apps/mobile/.env.');

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await new File(imageUri).arrayBuffer());
  } catch {
    throw new GradingError('bad_image', "Couldn't read this page's photo on the phone.");
  }
  const parts: MultipartPart[] = [
    { name: 'image', filename: 'page.jpg', contentType: 'image/jpeg', bytes },
    { name: 'context', value: JSON.stringify(context) },
  ];
  if (opts.unit) parts.push({ name: 'unit', value: opts.unit });
  const { body, contentType } = buildMultipartBody(parts);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GRADING_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetch(`${apiConfig.url}/v1/tutor`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiConfig.secret}`, 'content-type': contentType },
      body,
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const error = (json as { error?: { code?: GradeErrorCode; message?: string } } | null)?.error;
      throw new GradingError(error?.code ?? 'grading_failed', error?.message ?? `Server error ${response.status}.`);
    }
    const parsed = TutorResultSchema.safeParse(json);
    if (!parsed.success) throw new GradingError('grading_failed', 'The server sent an unexpected answer.');
    return parsed.data;
  } catch (error) {
    if (error instanceof GradingError) throw error;
    if (timedOut) throw new GradingError('timeout', 'The server took too long to answer.');
    if (opts.signal?.aborted) throw new GradingError('cancelled', 'Cancelled.');
    throw new GradingError('network', `Couldn't reach the grading server at ${apiConfig.url}.`);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', forwardAbort);
  }
}
