import { UsageSummarySchema, type UsageSummary } from '@calc/shared';
import { fetch } from 'expo/fetch';

import { apiConfig } from '@/config';

/** Spending so far, from the grading server. Throws if it can't be reached. */
export async function fetchUsage(signal?: AbortSignal): Promise<UsageSummary> {
  const response = await fetch(`${apiConfig.url}/v1/usage`, {
    headers: { authorization: `Bearer ${apiConfig.secret}` },
    signal,
  });
  if (!response.ok) throw new Error(`Server error ${response.status}`);
  return UsageSummarySchema.parse(await response.json());
}
