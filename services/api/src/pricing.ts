/** USD per million tokens. Thinking tokens are billed as output. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Estimated request cost. Unknown models fall back to Opus 5.5 pricing (the conservative choice). */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? PRICES['claude-opus-5-5']!;
  return Math.round(((inputTokens * price.input + outputTokens * price.output) / 1e6) * 1e5) / 1e5;
}
