/**
 * Node-only offline evaluator: runs the decision-layer env with a chat-backed
 * planner via a remote OpenAI-compatible chat completions API.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npm run eval:llm -- \
 *     --model <id> --domain hospitality --episodes 30 --concurrency 4
 *
 * Writes results/<model-slug>.<domain>.json
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hospitalityConfig } from '../src/config/hospitality.ts';
import { foldingConfig } from '../src/config/folding.ts';
import { aggregateScores } from '../src/engine/metrics.ts';
import { deriveLlmExecutorStream } from '../src/engine/rng.ts';
import { runEpisodeWithLlm } from '../src/engine/runner.ts';
import type { ChatCompleteFn } from '../src/engine/planner/llm.ts';
import type { MeasuredRunResult, Scorecard, TaskConfig } from '../src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API_BASE = 'https://openrouter.ai/api/v1';
const API_URL = `${API_BASE}/chat/completions`;

interface CliArgs {
  model: string;
  domain: string;
  episodes: number;
  concurrency: number;
  temperature: number;
  maxTokens: number;
  outDir: string;
  /** Local heuristic planner — no network (pipeline smoke / CI) */
  mock: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    model: '',
    domain: 'hospitality',
    episodes: 30,
    concurrency: 4,
    temperature: 0,
    maxTokens: 300,
    outDir: path.join(ROOT, 'results'),
    mock: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === '--model' && next) {
      out.model = next;
      i++;
    } else if (a === '--domain' && next) {
      out.domain = next;
      i++;
    } else if (a === '--episodes' && next) {
      out.episodes = Number(next);
      i++;
    } else if (a === '--concurrency' && next) {
      out.concurrency = Number(next);
      i++;
    } else if (a === '--out' && next) {
      out.outDir = path.resolve(next);
      i++;
    } else if (a === '--mock') {
      out.mock = true;
      if (!out.model) out.model = 'mock/heuristic-planner';
    }
  }
  if (!out.model) {
    console.error(
      'Usage: --model <id> [--domain hospitality|folding] [--episodes N] [--concurrency N] [--mock]',
    );
    process.exit(2);
  }
  return out;
}

function modelSlug(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

function modelShortName(modelId: string): string {
  const parts = modelId.split('/');
  return parts[parts.length - 1] ?? modelId;
}

function resolveConfig(domain: string): TaskConfig {
  if (domain === 'folding') return foldingConfig;
  if (domain === 'hospitality') return hospitalityConfig;
  console.error(`Unknown domain: ${domain}`);
  process.exit(2);
}

async function loadSystemPrompt(config: TaskConfig): Promise<{ text: string; hash: string }> {
  const promptPath = path.join(__dirname, 'prompts', 'planner-system.md');
  const base = await readFile(promptPath, 'utf8');
  const text =
    base +
    `\n\n## Domain instruction\n\n${config.instruction}\n` +
    `\n## Domain skills\n\n` +
    config.skills.map((s) => `- ${s.id} (${s.role}): label="${s.label}"`).join('\n') +
    `\n\n## Attribute vocabulary (labels only — not episode answers)\n\n` +
    config.itemAttributes
      .map((a) => {
        const tags = [
          a.hazard ? 'hazard' : null,
          a.special ? 'special' : null,
          a.normal ? 'normal' : null,
        ]
          .filter(Boolean)
          .join(', ');
        return `- ${a.id}: ${a.label} [${tags}]`;
      })
      .join('\n') +
    `\n`;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return { text, hash };
}

/** Cheap local stand-in that emits legal JSON actions from planner-visible state. */
function makeMockChat(): ChatCompleteFn {
  return async (messages) => {
    const user = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    // State payload starts at the planner view object (has "instruction"), not the schema example
    const marker = user.indexOf('"instruction"');
    let view: {
      items?: Array<{
        id: string;
        phase: string;
        inspected: boolean;
        believedAttribute: string | null;
        inContainer: boolean;
        setAside: boolean;
      }>;
      containers?: Array<{ fill: number; capacity: number }>;
      manifest?: { claimedCount: number; visibleItemCount: number };
      priorActions?: Array<{ kind: string; success: boolean; itemId?: string; skillId?: string }>;
      heldItemId?: string | null;
      step?: number;
    } = {};
    if (marker >= 0) {
      const jsonStart = user.lastIndexOf('{', marker);
      if (jsonStart >= 0) {
        try {
          view = JSON.parse(user.slice(jsonStart)) as typeof view;
        } catch {
          /* ignore */
        }
      }
    }

    const items = view.items ?? [];
    const unresolved = items.filter((i) => !i.inContainer && !i.setAside);
    const last = view.priorActions?.[view.priorActions.length - 1];
    const didInspect = items.some((i) => i.inspected);
    const didManifest = (view.priorActions ?? []).some((a) => a.kind === 'checkManifest');

    let action: Record<string, unknown>;
    if (!didManifest) {
      action = { action: 'checkManifest', reason: 'mock: verify ticket' };
    } else if (!didInspect) {
      action = { action: 'reInspect', reason: 'mock: inspect beliefs' };
    } else if (
      last &&
      !last.success &&
      last.itemId &&
      last.skillId &&
      ['pick', 'prepare', 'finish', 'place', 'setAside'].includes(last.kind)
    ) {
      const fails = (view.priorActions ?? []).filter(
        (a) => a.itemId === last.itemId && a.skillId === last.skillId && !a.success,
      ).length;
      if (fails >= 2) {
        const placeSkill = user.includes('"id": "stack"') ? 'stack' : 'bag';
        action = {
          action: 'placeIncomplete',
          skillId: placeSkill,
          itemId: last.itemId,
          flagIncomplete: true,
          reason: 'mock: repeated fail — flag incomplete',
        };
      } else {
        action = {
          action: 'reposition',
          skillId: last.skillId,
          itemId: last.itemId,
          reason: 'mock: reposition after fail',
        };
      }
    } else {
      const target = unresolved[0];
      if (!target) {
        action = { action: 'escalate', reason: 'mock: nothing left' };
      } else if (
        target.believedAttribute &&
        (target.believedAttribute.includes('damp') ||
          target.believedAttribute.includes('stain') ||
          target.believedAttribute.includes('hotel') ||
          target.believedAttribute.includes('foreign') ||
          target.believedAttribute.includes('wet'))
      ) {
        action = {
          action: 'setAside',
          skillId: 'setAside',
          itemId: target.id,
          reason: 'mock: exception set-aside',
        };
      } else if (target.phase === 'raw') {
        action = {
          action: 'pick',
          skillId: 'pick',
          itemId: target.id,
          reason: 'mock: pick next',
        };
      } else if (target.phase === 'picked') {
        const prepareSkill =
          items.length && user.includes('"id": "unfold"') ? 'unfold' : 'fold';
        // Prefer finish if no prepare skill in domain
        if (user.includes('"id": "unfold"') || user.includes('"role": "prepare"')) {
          action = {
            action: 'prepare',
            skillId: 'unfold',
            itemId: target.id,
            reason: 'mock: prepare',
          };
        } else {
          action = {
            action: 'finish',
            skillId: 'fold',
            itemId: target.id,
            reason: 'mock: fold',
          };
        }
        void prepareSkill;
      } else if (target.phase === 'prepared') {
        action = {
          action: 'finish',
          skillId: 'fold',
          itemId: target.id,
          reason: 'mock: fold',
        };
      } else if (target.phase === 'finished') {
        const c0 = view.containers?.[0];
        if (c0 && c0.fill >= c0.capacity) {
          action = { action: 'openContainer', reason: 'mock: open container' };
        } else {
          const placeSkill = user.includes('"id": "stack"') ? 'stack' : 'bag';
          action = {
            action: 'place',
            skillId: placeSkill,
            itemId: target.id,
            reason: 'mock: place',
          };
        }
      } else {
        action = {
          action: 'pick',
          skillId: 'pick',
          itemId: target.id,
          reason: 'mock: default pick',
        };
      }
    }

    const content = JSON.stringify(action);
    return {
      content,
      usage: {
        promptTokens: Math.ceil(user.length / 4),
        completionTokens: Math.ceil(content.length / 4),
        cost: 0,
      },
    };
  };
}

function makeChat(apiKey: string, model: string, temperature: number, maxTokens: number): ChatCompleteFn {
  return async (messages) => {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Jaiparmar940/decision-layer-rl-demo',
        'X-Title': 'decision-layer-rl-demo-eval',
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`chat API ${res.status}: ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
        total_cost?: number;
      };
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? {};
    return {
      content,
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        cost: usage.total_cost ?? usage.cost ?? 0,
      },
    };
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!args.mock && !apiKey) {
    console.error('OPENROUTER_API_KEY is required (or pass --mock for local smoke)');
    process.exit(2);
  }

  const config = resolveConfig(args.domain);
  const { text: systemPrompt, hash: promptHash } = await loadSystemPrompt(config);
  const chat = args.mock
    ? makeMockChat()
    : makeChat(apiKey!, args.model, args.temperature, args.maxTokens);

  console.log(
    `eval llm model=${args.model} domain=${args.domain} episodes=${args.episodes} concurrency=${args.concurrency}`,
  );
  console.log(`prompt hash=${promptHash}`);

  const t0 = Date.now();
  const indices = Array.from({ length: args.episodes }, (_, i) => i);

  const episodeResults = await mapPool(indices, args.concurrency, async (i) => {
    const masterSeed = 1000 + i * 97 + ((i * 13) % 89);
    const serial = i + 1;
    const executorRng = deriveLlmExecutorStream(masterSeed, args.model);
    try {
      const ep = await runEpisodeWithLlm({
        config,
        masterSeed,
        episodeSerial: serial,
        modelId: args.model,
        systemPrompt,
        chat,
        executorRng,
      });
      console.log(
        `  ep ${serial}/${args.episodes} steps=${ep.score.totalSteps} invalid=${ep.invalidActions} tokens=${ep.tokenUsage.promptTokens + ep.tokenUsage.completionTokens}`,
      );
      return ep;
    } catch (e) {
      console.error(`  ep ${serial} FAILED`, e);
      throw e;
    }
  });

  const wallMs = Date.now() - t0;
  const scores: Scorecard[] = episodeResults.map((e) => e.score);
  const metrics = aggregateScores('llm', scores);

  const invalidActionCount = episodeResults.reduce((a, e) => a + e.invalidActions, 0);
  const totalTokens = episodeResults.reduce(
    (a, e) => a + e.tokenUsage.promptTokens + e.tokenUsage.completionTokens,
    0,
  );
  const totalCost = episodeResults.reduce((a, e) => a + e.tokenUsage.cost, 0);
  const meanSteps =
    scores.length === 0
      ? 0
      : scores.reduce((a, s) => a + s.totalSteps, 0) / scores.length;

  const artifact: MeasuredRunResult = {
    modelId: args.model,
    modelShortName: modelShortName(args.model),
    domain: args.domain,
    episodeCount: args.episodes,
    date: new Date().toISOString(),
    promptTemplateHash: promptHash,
    metrics,
    invalidActionCount,
    meanSteps,
    meanTokensPerEpisode: args.episodes === 0 ? 0 : totalTokens / args.episodes,
    totalCostEstimate: totalCost,
    wallMs,
  };

  await mkdir(args.outDir, { recursive: true });
  const fileName = `${modelSlug(args.model)}.${args.domain}.json`;
  const outPath = path.join(args.outDir, fileName);
  await writeFile(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

  console.log('---');
  console.log(`wrote ${outPath}`);
  console.log(`wall_ms=${wallMs}`);
  console.log(`total_cost_estimate_usd=${totalCost.toFixed(6)}`);
  console.log(`mean_tokens_per_episode=${artifact.meanTokensPerEpisode.toFixed(1)}`);
  console.log(`invalid_actions=${invalidActionCount}`);
  console.log(`mean_steps=${meanSteps.toFixed(1)}`);
  console.log(
    `To show on dashboard, merge into public/results/measured.${args.domain}.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
