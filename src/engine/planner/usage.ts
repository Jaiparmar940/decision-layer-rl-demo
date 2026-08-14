import type { ChatCompletionUsage } from './llm';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function nest(
  obj: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const v = obj?.[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Normalize provider usage (gateway / direct chat / Gemini compat /
 * Gemini usageMetadata) into a single vector. Cost is taken from the
 * provider payload when present — never a local price table.
 */
export function parseProviderUsage(
  usage: unknown,
  extras?: Record<string, unknown>,
): ChatCompletionUsage {
  const u =
    usage && typeof usage === 'object' && !Array.isArray(usage)
      ? (usage as Record<string, unknown>)
      : {};
  const meta =
    extras && typeof extras === 'object'
      ? (extras.usageMetadata as Record<string, unknown> | undefined) ??
        nest(extras, 'usage_metadata')
      : undefined;

  const promptDetails =
    nest(u, 'prompt_tokens_details') ?? nest(u, 'promptTokensDetails') ?? nest(u, 'input_tokens_details');
  const completionDetails =
    nest(u, 'completion_tokens_details') ??
    nest(u, 'completionTokensDetails') ??
    nest(u, 'output_tokens_details');

  const promptTokens =
    num(u.prompt_tokens) ||
    num(u.promptTokens) ||
    num(u.input_tokens) ||
    num(meta?.promptTokenCount);

  const completionTokens =
    num(u.completion_tokens) ||
    num(u.completionTokens) ||
    num(u.output_tokens) ||
    num(meta?.candidatesTokenCount);

  const reasoningTokens =
    num(completionDetails?.reasoning_tokens) ||
    num(completionDetails?.reasoningTokens) ||
    num(completionDetails?.thinking_tokens) ||
    num(u.reasoning_tokens) ||
    num(u.native_tokens_reasoning) ||
    num(meta?.thoughtsTokenCount);

  const cachedTokens =
    num(promptDetails?.cached_tokens) ||
    num(promptDetails?.cachedTokens) ||
    num(u.cached_tokens) ||
    num(u.native_tokens_cached) ||
    num(meta?.cachedContentTokenCount);

  const totalTokens =
    num(u.total_tokens) ||
    num(u.totalTokens) ||
    num(meta?.totalTokenCount) ||
    promptTokens + completionTokens;

  const cost =
    num(u.cost) ||
    num(u.total_cost) ||
    num(u.totalCost) ||
    num(extras?.cost) ||
    num(nest(u, 'cost_details')?.upstream_inference_cost);

  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    cachedTokens,
    totalTokens,
    cost,
  };
}

export function emptyUsage(): ChatCompletionUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
}

export function addUsage(
  a: ChatCompletionUsage,
  b: ChatCompletionUsage,
): ChatCompletionUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    reasoningTokens: (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
    cachedTokens: (a.cachedTokens ?? 0) + (b.cachedTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
    cost: (a.cost ?? 0) + (b.cost ?? 0),
  };
}

export function formatUsageLine(u: ChatCompletionUsage): string {
  const total =
    u.totalTokens || u.promptTokens + u.completionTokens;
  return `prompt=${u.promptTokens} completion=${u.completionTokens} reasoning=${u.reasoningTokens ?? 0} cached=${u.cachedTokens ?? 0} total=${total} cost_usd=${(u.cost ?? 0).toFixed(6)}`;
}
