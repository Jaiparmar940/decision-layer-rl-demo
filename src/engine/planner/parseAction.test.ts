import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../../config/hospitality';
import { deriveLlmExecutorStream } from '../rng';
import { runEpisodeWithLlm } from '../runner';
import type { ChatCompleteFn } from './llm';
import { parseLlmActionJson } from './llm';
import {
  AdapterPathologyError,
  createPathologyGate,
  extractLlmAction,
  lastBalancedObject,
  normalizeActionKind,
  recordFromFailure,
} from './parseAction';

describe('extractLlmAction', () => {
  it('direct-parses a canonical object', () => {
    const r = extractLlmAction(
      '{"action":"checkManifest","reason":"verify ticket"}',
    );
    expect(r.path).toBe('direct');
    expect(r.draft?.action).toBe('checkManifest');
  });

  it('strips markdown fences that are not the whole string prefix', () => {
    const r = extractLlmAction(
      'Sure, here you go:\n```json\n{"action":"reInspect","reason":"look again"}\n```\n',
    );
    expect(r.path).toBe('fence');
    expect(r.draft?.action).toBe('reInspect');
  });

  it('takes the last balanced object after prose / thinking', () => {
    const r = extractLlmAction(
      'Thinking {not json} then an earlier {"action":"pick","reason":"no"} and finally {"kind":"set_aside","item_id":"item-1","skill_id":"setAside","reason":"hazard"}',
    );
    expect(r.path).toBe('balanced');
    expect(r.draft?.action).toBe('setAside');
    expect(r.draft?.itemId).toBe('item-1');
    expect(r.draft?.skillId).toBe('setAside');
  });

  it('accepts kind as well as action, and kebab/camel/snake kinds', () => {
    expect(
      extractLlmAction('{"kind":"place-incomplete","reason":"flag"}').draft
        ?.action,
    ).toBe('placeIncomplete');
    expect(
      extractLlmAction('{"action":"OpenContainer","reason":"full"}').draft
        ?.action,
    ).toBe('openContainer');
    expect(
      extractLlmAction('{"action":"check_manifest","reason":"x"}').draft?.action,
    ).toBe('checkManifest');
  });

  it('does not treat unknown kind as unparseable once JSON is found', () => {
    const r = extractLlmAction('{"action":"teleport","reason":"nope"}');
    expect(r.path).toBe('direct');
    expect(r.draft).toBeNull();
    expect(r.error).toMatch(/illegal action kind/);
    const rec = recordFromFailure('{"action":"teleport","reason":"nope"}', r);
    expect(rec.reason).toBe('unknown_kind');
  });

  it('marks non-JSON as unparseable', () => {
    const r = extractLlmAction('I will pick the next item.');
    expect(r.path).toBe('none');
    expect(recordFromFailure('I will pick the next item.', r).reason).toBe(
      'unparseable',
    );
  });
});

describe('normalizeActionKind', () => {
  it('maps aliases to canonical kinds', () => {
    expect(normalizeActionKind('set-aside')).toBe('setAside');
    expect(normalizeActionKind('SET_ASIDE')).toBe('setAside');
    expect(normalizeActionKind('reinspect')).toBe('reInspect');
    expect(normalizeActionKind('placeIncomplete')).toBe('placeIncomplete');
  });
});

describe('lastBalancedObject', () => {
  it('ignores braces inside strings', () => {
    const s = lastBalancedObject(
      'say "{" then {"action":"finish","reason":"done {ok}"}',
    );
    expect(s).toContain('"finish"');
  });
});

describe('parseLlmActionJson', () => {
  it('still accepts strict JSON', () => {
    const draft = parseLlmActionJson(
      '{"action":"pick","skillId":"pick","itemId":"item-1","reason":"go"}',
    );
    expect(draft.action).toBe('pick');
  });
});

describe('adapter pathology abort', () => {
  it('aborts after 10 steps when invalid rate exceeds 25%', async () => {
    const garbage: ChatCompleteFn = async () => ({
      content: 'not json at all',
      usage: { promptTokens: 1, completionTokens: 1, cost: 0 },
    });
    const gate = createPathologyGate();
    await expect(
      runEpisodeWithLlm({
        config: hospitalityConfig,
        masterSeed: 1001,
        episodeSerial: 1,
        modelId: 'mock/garbage',
        systemPrompt: 'test',
        chat: garbage,
        executorRng: deriveLlmExecutorStream(1001, 'mock/garbage'),
        maxSteps: 20,
        throwIfAborted: () => gate.throwIfAborted(),
        onPlannerStep: (info) => gate.onPlannerStep(info),
      }),
    ).rejects.toBeInstanceOf(AdapterPathologyError);
    expect(gate.steps).toBe(10);
    expect(gate.invalid).toBe(10);
    expect(gate.records[0]?.reason).toBe('unparseable');
  });

  it('does not abort when invalids stay at or below 25%', async () => {
    let n = 0;
    const mixed: ChatCompleteFn = async () => {
      n += 1;
      // Two API calls per invalid env step (retry). First two env steps garbage, rest legal.
      if (n <= 4) {
        return {
          content: 'nope',
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      }
      return {
        content: JSON.stringify({ action: 'reInspect', reason: 'ok' }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    };
    const gate = createPathologyGate();
    const ep = await runEpisodeWithLlm({
      config: hospitalityConfig,
      masterSeed: 1001,
      episodeSerial: 1,
      modelId: 'mock/mixed',
      systemPrompt: 'test',
      chat: mixed,
      executorRng: deriveLlmExecutorStream(1001, 'mock/mixed'),
      maxSteps: 12,
      throwIfAborted: () => gate.throwIfAborted(),
      onPlannerStep: (info) => gate.onPlannerStep(info),
    });
    expect(gate.steps).toBeGreaterThanOrEqual(10);
    expect(gate.invalid).toBe(2);
    expect(ep.invalidActions).toBe(2);
  });
});
