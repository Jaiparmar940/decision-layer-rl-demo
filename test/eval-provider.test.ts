import { describe, expect, it } from 'vitest';
import {
  chatCompletionsBody,
  extractChatMessage,
  nativeModelId,
  parseProvider,
  resolveApiKey,
  resolveEndpoint,
} from '../scripts/eval-provider';

describe('eval provider', () => {
  it('defaults to openrouter', () => {
    expect(parseProvider(undefined)).toBe('openrouter');
    expect(parseProvider('OpenRouter')).toBe('openrouter');
  });

  it('accepts openai', () => {
    expect(parseProvider('openai')).toBe('openai');
  });

  it('accepts google and gemini aliases', () => {
    expect(parseProvider('google')).toBe('google');
    expect(parseProvider('gemini')).toBe('google');
  });

  it('rejects unknown providers', () => {
    expect(() => parseProvider('anthropic')).toThrow(/Unknown --provider/);
  });

  it('resolves Google Gemini OpenAI-compat endpoint and GOOGLE_API_KEY', () => {
    const ep = resolveEndpoint('google');
    expect(ep.apiUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(ep.envKey).toBe('GOOGLE_API_KEY');
  });

  it('resolves OpenAI api.openai.com and OPENAI_API_KEY', () => {
    const ep = resolveEndpoint('openai');
    expect(ep.apiUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(ep.envKey).toBe('OPENAI_API_KEY');
    expect(ep.extraHeaders).toEqual({});
  });

  it('resolves OpenRouter defaults', () => {
    const ep = resolveEndpoint('openrouter');
    expect(ep.apiUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(ep.envKey).toBe('OPENROUTER_API_KEY');
    expect(ep.extraHeaders['HTTP-Referer']).toBeTruthy();
  });

  it('honors --base-url override', () => {
    const ep = resolveEndpoint('openai', 'https://example.local/v1/');
    expect(ep.apiUrl).toBe('https://example.local/v1/chat/completions');
  });

  it('strips vendor prefix only for the matching native provider', () => {
    expect(nativeModelId('openai', 'openai/gpt-4.1-mini')).toBe('gpt-4.1-mini');
    expect(nativeModelId('openai', 'gpt-4.1-mini')).toBe('gpt-4.1-mini');
    expect(nativeModelId('google', 'google/gemini-3.5-flash')).toBe(
      'gemini-3.5-flash',
    );
    expect(nativeModelId('google', 'gemini-3.5-flash')).toBe('gemini-3.5-flash');
    expect(nativeModelId('openrouter', 'google/gemini-3.5-flash')).toBe(
      'google/gemini-3.5-flash',
    );
  });

  it('uses max_completion_tokens for OpenAI and max_tokens for OpenRouter', () => {
    const openai = chatCompletionsBody('openai', {
      model: 'gpt-5.6-sol',
      messages: [],
      temperature: 0,
      maxTokens: 300,
    });
    expect(openai.max_completion_tokens).toBe(300);
    expect(openai.max_tokens).toBeUndefined();
    expect(openai.temperature).toBeUndefined();
    expect(openai.usage).toBeUndefined();

    const or = chatCompletionsBody('openrouter', {
      model: 'meta-llama/llama-3.1-8b-instruct',
      messages: [],
      temperature: 0,
      maxTokens: 300,
    });
    expect(or.max_tokens).toBe(300);
    expect(or.temperature).toBe(0);
    expect(or.max_completion_tokens).toBeUndefined();
    expect(or.usage).toEqual({ include: true });

    const g = chatCompletionsBody('google', {
      model: 'gemini-3.5-flash',
      messages: [],
      temperature: 0,
      maxTokens: 300,
    });
    expect(g.max_tokens).toBe(300);
    expect(g.temperature).toBe(0);
    expect(g.usage).toBeUndefined();
  });

  it('extracts message.content and ignores reasoning fields', () => {
    const msg = extractChatMessage({
      choices: [
        {
          message: {
            content: '{"action":"checkManifest","reason":"ok"}',
            reasoning: 'long private chain of thought',
            reasoning_content: 'also ignored',
          },
        },
      ],
    });
    expect(msg.contentSource).toBe('message.content');
    expect(msg.content).toContain('checkManifest');
    expect(msg.reasoning).toContain('long private');
  });

  it('joins content parts and skips thought parts', () => {
    const msg = extractChatMessage({
      choices: [
        {
          message: {
            content: [
              { type: 'thought', text: 'secret' },
              { type: 'text', text: '{"kind":"reInspect","reason":"x"}' },
            ],
          },
        },
      ],
    });
    expect(msg.contentSource).toBe('message.content_parts');
    expect(msg.content).toContain('reInspect');
    expect(msg.content).not.toContain('secret');
  });

  it('does not fall back to reasoning when content is empty', () => {
    const msg = extractChatMessage({
      choices: [
        {
          message: {
            content: null,
            reasoning: '{"action":"pick","reason":"from reasoning"}',
          },
        },
      ],
    });
    expect(msg.contentSource).toBe('empty');
    expect(msg.content).toBe('');
    expect(msg.reasoning).toContain('from reasoning');
  });

  it('reads the matching env key', () => {
    expect(
      resolveApiKey('OPENAI_API_KEY', { OPENAI_API_KEY: ' test-key ' }),
    ).toBe('test-key');
    expect(resolveApiKey('OPENAI_API_KEY', {})).toBeNull();
  });
});
