import { describe, expect, it } from 'vitest';
import { parseProviderUsage } from './usage';

describe('parseProviderUsage', () => {
  it('reads gateway cost, reasoning, and cached tokens', () => {
    const u = parseProviderUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      cost: 0.00421,
      prompt_tokens_details: { cached_tokens: 40 },
      completion_tokens_details: { reasoning_tokens: 22 },
    });
    expect(u.promptTokens).toBe(100);
    expect(u.completionTokens).toBe(50);
    expect(u.reasoningTokens).toBe(22);
    expect(u.cachedTokens).toBe(40);
    expect(u.totalTokens).toBe(150);
    expect(u.cost).toBe(0.00421);
  });

  it('reads OpenAI reasoning/cached details without inventing a price', () => {
    const u = parseProviderUsage({
      prompt_tokens: 80,
      completion_tokens: 40,
      total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 10 },
      completion_tokens_details: { reasoning_tokens: 30 },
    });
    expect(u.reasoningTokens).toBe(30);
    expect(u.cachedTokens).toBe(10);
    expect(u.cost).toBe(0);
  });

  it('reads Gemini usageMetadata on the response root', () => {
    const u = parseProviderUsage(undefined, {
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        thoughtsTokenCount: 9,
        cachedContentTokenCount: 3,
        totalTokenCount: 27,
      },
    });
    expect(u.promptTokens).toBe(11);
    expect(u.completionTokens).toBe(7);
    expect(u.reasoningTokens).toBe(9);
    expect(u.cachedTokens).toBe(3);
    expect(u.totalTokens).toBe(27);
  });
});
