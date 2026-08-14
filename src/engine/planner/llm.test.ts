import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../../config/hospitality';
import { deriveLlmExecutorStream } from '../rng';
import { runEpisodeWithLlm } from '../runner';
import type { ChatCompleteFn } from './llm';
import { parseLlmActionJson, validateLlmAction } from './llm';
import { createInitialState, generateEpisodeSeed } from '../episode';

const mockChat: ChatCompleteFn = async (messages) => {
  const user = messages[messages.length - 1]?.content ?? '';
  // Always reInspect first-ish: if validation retry, still legal
  const content = user.includes('Validation error')
    ? JSON.stringify({
        action: 'reInspect',
        reason: 'retry inspect',
      })
    : JSON.stringify({
        action: 'checkManifest',
        reason: 'check ticket',
      });
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 5, cost: 0 },
  };
};

describe('llm planner adapter', () => {
  it('parses strict JSON and rejects illegal actions', () => {
    const draft = parseLlmActionJson(
      '{"action":"pick","skillId":"pick","itemId":"item-1","reason":"go"}',
    );
    expect(draft.action).toBe('pick');
    const { seedData } = generateEpisodeSeed(hospitalityConfig, 1, 1);
    const state = createInitialState(seedData, 'llm', hospitalityConfig);
    expect(validateLlmAction(draft, state, hospitalityConfig)).toBeNull();
    expect(
      validateLlmAction(
        { action: 'teleport' as never, reason: 'nope' },
        state,
        hospitalityConfig,
      ),
    ).toMatch(/illegal/);
  });

  it('runs a short episode via chat injection without network', async () => {
    const ep = await runEpisodeWithLlm({
      config: hospitalityConfig,
      masterSeed: 1001,
      episodeSerial: 1,
      modelId: 'mock/test',
      systemPrompt: 'test',
      chat: mockChat,
      executorRng: deriveLlmExecutorStream(1001, 'mock/test'),
      maxSteps: 8,
    });
    expect(ep.score.totalSteps).toBeGreaterThan(0);
    expect(ep.score.stepsExhausted || ep.state.done).toBe(true);
    expect(ep.tokenUsage.promptTokens).toBeGreaterThan(0);
    expect(ep.transcript.source).toBe('llm');
    expect(ep.transcript.steps.length).toBeGreaterThan(0);
    expect(ep.transcript.steps[0]!.action.action).toBeTruthy();
    expect(ep.transcript.steps[0]!.payloadText.length).toBeGreaterThan(0);
  });
});
