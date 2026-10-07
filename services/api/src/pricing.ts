/** USD per million tokens. Thinking tokens are billed as output. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Prompt-cache multipliers on the input price: 5-minute writes and reads. */
const CACHE_WRITE = 1.25;
const CACHE_READ: Record<string, number> = { 'claude-opus-5-5': 0.05 };
const DEFAULT_CACHE_READ = 0.1;

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/**
 * Estimated cost of one response. `input_tokens` excludes cached tokens, which
 * are billed separately. Unknown models fall back to Opus 5.5 pricing (the
 * conservative choice).
 */
export function estimateCost(model: string, usage: TokenUsage): number {
  const price = PRICES[model] ?? PRICES['claude-opus-5-5']!;
  const read = CACHE_READ[model] ?? DEFAULT_CACHE_READ;
  const input =
    usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * CACHE_WRITE + (usage.cache_read_input_tokens ?? 0) * read;
  return Math.round(((input * price.input + usage.output_tokens * price.output) / 1e6) * 1e5) / 1e5;
}

/** All input tokens the model saw, cached or not. */
export function totalInputTokens(usage: TokenUsage): number {
  return usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
}
