import { UsageSummarySchema, type UsageSummary } from '@calc/shared';
import { fetch } from 'expo/fetch';

import { apiConfig } from '@/config';

const USAGE_TIMEOUT_MS = 15_000;

/** Spending so far, from the grading server. Throws if it can't be reached in time. */
export async function fetchUsage(signal?: AbortSignal): Promise<UsageSummary> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), USAGE_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);
  try {
    const response = await fetch(`${apiConfig.url}/v1/usage`, {
      headers: { authorization: `Bearer ${apiConfig.secret}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Server error ${response.status}`);
    return UsageSummarySchema.parse(await response.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
