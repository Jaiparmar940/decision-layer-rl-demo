/** Node-only eval endpoint resolution. Not imported by the Vite app. */

export type EvalProvider = 'openrouter' | 'openai' | 'google';

export interface ProviderEndpoint {
  provider: EvalProvider;
  apiUrl: string;
  envKey: string;
  extraHeaders: Record<string, string>;
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
/** Gemini OpenAI-compatible Chat Completions root. */
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

const PROVIDER_ENV: Record<EvalProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

const NATIVE_PREFIX: Record<EvalProvider, string | null> = {
  openrouter: null,
  openai: 'openai/',
  google: 'google/',
};

export function parseProvider(raw: string | undefined): EvalProvider {
  const v = (raw ?? 'openrouter').trim().toLowerCase();
  if (v === 'openai') return 'openai';
  if (v === 'openrouter') return 'openrouter';
  if (v === 'google' || v === 'gemini') return 'google';
  throw new Error(`Unknown --provider ${raw} (use openrouter|openai|google)`);
}

export function resolveEndpoint(
  provider: EvalProvider,
  baseUrlOverride?: string,
): ProviderEndpoint {
  const fallback =
    provider === 'openai'
      ? OPENAI_BASE
      : provider === 'google'
        ? GOOGLE_BASE
        : OPENROUTER_BASE;
  const base = (baseUrlOverride ?? fallback).trim().replace(/\/+$/, '');
  return {
    provider,
    apiUrl: `${base}/chat/completions`,
    envKey: PROVIDER_ENV[provider],
    extraHeaders:
      provider === 'openrouter'
        ? {
            'HTTP-Referer': 'https://github.com/Jaiparmar940/decision-layer-rl-demo',
            'X-Title': 'decision-layer-rl-demo-eval',
          }
        : {},
  };
}

export function resolveApiKey(
  envKey: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const v = env[envKey];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

/**
 * Native APIs want unprefixed ids (`gpt-5.6-sol`, `gemini-3.5-flash`).
 * OpenRouter keeps `google/gemini-3.5-flash`.
 */
export function nativeModelId(provider: EvalProvider, model: string): string {
  const prefix = NATIVE_PREFIX[provider];
  if (prefix && model.startsWith(prefix)) return model.slice(prefix.length);
  return model;
}

/**
 * GPT-5.x rejects `max_tokens` (use `max_completion_tokens`) and only
 * allows default temperature (1) — omit the field so the API default applies.
 * OpenRouter and Google Gemini's OpenAI-compat endpoint use `max_tokens`
 * + explicit temperature.
 */
export function chatCompletionsBody(
  provider: EvalProvider,
  args: {
    model: string;
    messages: unknown;
    temperature: number;
    maxTokens: number;
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
  };
  if (provider === 'openai') {
    body.max_completion_tokens = args.maxTokens;
  } else {
    body.temperature = args.temperature;
    body.max_tokens = args.maxTokens;
  }
  // OpenRouter omits usage.cost unless this flag is set.
  if (provider === 'openrouter') {
    body.usage = { include: true };
  }
  return body;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

function partText(part: unknown): string {
  if (typeof part === 'string') return part;
  const p = asRecord(part);
  if (!p) return '';
  if (p.thought === true || p.type === 'thought' || p.type === 'reasoning') {
    return '';
  }
  return typeof p.text === 'string' ? p.text : '';
}

export type ChatContentSource =
  | 'message.content'
  | 'message.content_parts'
  | 'empty';

/**
 * Take the provider's answer text, never the reasoning/thinking channel.
 */
export function extractChatMessage(data: unknown): {
  content: string;
  reasoning: string;
  contentSource: ChatContentSource;
} {
  const root = asRecord(data) ?? {};
  const choices = root.choices;
  const choice = Array.isArray(choices) ? asRecord(choices[0]) : undefined;
  const message = asRecord(choice?.message);

  const reasoningBits = [message?.reasoning, message?.reasoning_content, choice?.reasoning]
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
  const reasoning = reasoningBits.join('\n');

  const rawContent = message?.content ?? choice?.text;

  if (typeof rawContent === 'string' && rawContent.trim()) {
    return { content: rawContent, reasoning, contentSource: 'message.content' };
  }

  if (Array.isArray(rawContent)) {
    const texts = rawContent.map(partText).filter((t) => t.trim());
    if (texts.length) {
      return {
        content: texts.join('\n'),
        reasoning,
        contentSource: 'message.content_parts',
      };
    }
  }

  return { content: '', reasoning, contentSource: 'empty' };
}
