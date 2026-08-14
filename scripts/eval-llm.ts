/**
 * Node-only offline evaluator: runs the decision-layer env with a chat-backed
 * planner via a remote OpenAI-compatible chat completions API.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npm run eval:llm -- \
 *     --model <id> --domain hospitality --episodes 30 --concurrency 4
 *   OPENAI_API_KEY=... npm run eval:llm -- --provider openai \
 *     --model gpt-5.6-sol --domain hospitality --episodes 5 --concurrency 2
 *   GOOGLE_API_KEY=... npm run eval:llm -- --provider google \
 *     --model gemini-3.5-flash --domain hospitality --episodes 5 --concurrency 2
 *
 * Writes results/<model-slug>.<domain>.json and
 * results/<model-slug>.<domain>/ep-NN.transcript.json (.md) per episode.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hospitalityConfig } from '../src/config/hospitality.ts';
import { foldingConfig } from '../src/config/folding.ts';
import { scoringOf } from '../src/config/scoring.ts';
import { compositeScore } from '../src/engine/composite.ts';
import { aggregateScores } from '../src/engine/metrics.ts';
import { deriveLlmExecutorStream } from '../src/engine/rng.ts';
import { runEpisodeWithLlm } from '../src/engine/runner.ts';
import { transcriptToMarkdown } from '../src/engine/transcript.ts';
import type { ChatCompleteFn } from '../src/engine/planner/llm.ts';
import {
  AdapterPathologyError,
  createPathologyGate,
  formatHistogram,
  histogramFromRecords,
  type InvalidActionRecord,
} from '../src/engine/planner/parseAction.ts';
import { formatUsageLine, parseProviderUsage } from '../src/engine/planner/usage.ts';
import type { MeasuredRunResult, Scorecard, TaskConfig } from '../src/types.ts';
import {
  chatCompletionsBody,
  extractChatMessage,
  nativeModelId,
  parseProvider,
  resolveApiKey,
  resolveEndpoint,
  type EvalProvider,
} from './eval-provider.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface CliArgs {
  model: string;
  domain: string;
  episodes: number;
  concurrency: number;
  temperature: number;
  maxTokens: number;
  outDir: string;
  provider: EvalProvider;
  baseUrl?: string;
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
    provider: 'openrouter',
    mock: false,
  };
  let maxTokensExplicit = false;
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
    } else if (a === '--provider' && next) {
      try {
        out.provider = parseProvider(next);
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(2);
      }
      i++;
    } else if (a === '--base-url' && next) {
      out.baseUrl = next;
      i++;
    } else if (a === '--max-tokens' && next) {
      out.maxTokens = Number(next);
      maxTokensExplicit = true;
      i++;
    } else if (a === '--mock') {
      out.mock = true;
      if (!out.model) out.model = 'mock/heuristic-planner';
    }
  }
  if (!out.model) {
    console.error(
      'Usage: --model <id> [--provider openrouter|openai|google] [--base-url URL] [--domain hospitality|folding] [--episodes N] [--concurrency N] [--max-tokens N] [--mock]',
    );
    process.exit(2);
  }
  // Compact JSON fits in 300; thinking/flash models otherwise truncate mid-object
  // (the gemini-3.5-flash 234-invalid run was this, not unknown kinds).
  if (!maxTokensExplicit) {
    const reasoning =
      out.provider === 'openai' ||
      out.provider === 'google' ||
      /gemini|gpt-5|o1|o3|o4|claude/i.test(out.model);
    if (reasoning) out.maxTokens = 2048;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res: Response, attempt: number): number {
  const raw = res.headers.get('retry-after');
  if (raw) {
    const sec = Number(raw);
    if (Number.isFinite(sec) && sec >= 0) return Math.ceil(sec * 1000);
  }
  return Math.min(60_000, 2_000 * 2 ** attempt);
}

function makeChat(
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  apiUrl: string,
  extraHeaders: Record<string, string>,
  provider: EvalProvider,
): ChatCompleteFn {
  return async (messages) => {
    const payload = JSON.stringify(
      chatCompletionsBody(provider, {
        model,
        messages,
        temperature,
        maxTokens,
      }),
    );
    const maxAttempts = 8;
    let lastErr = '';
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: payload,
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const msg = extractChatMessage(data);
        return {
          content: msg.content,
          reasoning: msg.reasoning,
          contentSource: msg.contentSource,
          usage: parseProviderUsage(data.usage, data),
        };
      }
      const body = await res.text();
      lastErr = `chat API ${res.status}: ${body.slice(0, 400)}`;
      if (res.status !== 429 && res.status !== 503) {
        throw new Error(lastErr);
      }
      const wait = retryAfterMs(res, attempt);
      console.warn(`  rate-limited (${res.status}); retry ${attempt + 1}/${maxAttempts} in ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
    }
    throw new Error(lastErr);
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

/** Load KEY=value from .env without overriding vars already in the environment. */
function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadDotEnv(path.join(ROOT, '.env'));
  const args = parseArgs(process.argv.slice(2));
  const endpoint = resolveEndpoint(args.provider, args.baseUrl);
  const modelId = nativeModelId(args.provider, args.model);
  const apiKey = resolveApiKey(endpoint.envKey);
  if (!args.mock && !apiKey) {
    console.error(
      `${endpoint.envKey} is required for --provider ${args.provider} (or pass --mock for local smoke)`,
    );
    process.exit(2);
  }

  const config = resolveConfig(args.domain);
  const { text: systemPrompt, hash: promptHash } = await loadSystemPrompt(config);
  const chat = args.mock
    ? makeMockChat()
    : makeChat(
        apiKey!,
        modelId,
        args.temperature,
        args.maxTokens,
        endpoint.apiUrl,
        endpoint.extraHeaders,
        args.provider,
      );

  console.log(
    `eval llm provider=${args.provider} model=${modelId} domain=${args.domain} episodes=${args.episodes} concurrency=${args.concurrency} max_tokens=${args.maxTokens}`,
  );
  console.log(`endpoint=${endpoint.apiUrl}`);
  console.log(`prompt hash=${promptHash}`);
  console.log(
    'cost: provider usage.cost when present (no local price table); token breakdown always logged',
  );

  const t0 = Date.now();
  const indices = Array.from({ length: args.episodes }, (_, i) => i);
  const transcriptDir = path.join(args.outDir, `${modelSlug(modelId)}.${args.domain}`);
  await mkdir(transcriptDir, { recursive: true });
  const gate = createPathologyGate();

  let episodeResults: Array<
    Awaited<ReturnType<typeof runEpisodeWithLlm>> & {
      composite: ReturnType<typeof compositeScore>;
    }
  >;
  try {
    episodeResults = await mapPool(indices, args.concurrency, async (i) => {
    const masterSeed = 1000 + i * 97 + ((i * 13) % 89);
    const serial = i + 1;
    const executorRng = deriveLlmExecutorStream(masterSeed, modelId);
    try {
      const ep = await runEpisodeWithLlm({
        config,
        masterSeed,
        episodeSerial: serial,
        modelId,
        systemPrompt,
        chat,
        executorRng,
        throwIfAborted: () => gate.throwIfAborted(),
        onPlannerStep: (info) => {
          const n = gate.steps + 1;
          if (n <= 10 || info.invalid) {
            const fail = info.invalidRecord
              ? ` INVALID ${info.invalidRecord.reason} path=${info.extractionPath} tried=${info.invalidRecord.pathsTried.join('|')} ${info.invalidRecord.detail}`
              : '';
            console.log(
              `    parse step=${n} path=${info.extractionPath}${fail}`,
            );
          }
          gate.onPlannerStep(info);
        },
      });
      const scoring = scoringOf(config);
      const composite = compositeScore(ep.score, scoring);
      const epTag = `ep-${String(serial).padStart(2, '0')}`;
      await writeFile(
        path.join(transcriptDir, `${epTag}.transcript.json`),
        JSON.stringify(ep.transcript, null, 2) + '\n',
        'utf8',
      );
      await writeFile(
        path.join(transcriptDir, `${epTag}.transcript.md`),
        transcriptToMarkdown(ep.transcript, config),
        'utf8',
      );
      console.log(
        `  ep ${serial}/${args.episodes} steps=${ep.score.totalSteps} invalid=${ep.invalidActions} ${formatUsageLine(ep.tokenUsage)} composite=${composite.total} completed=${ep.score.taskCompleted} resolved=${ep.score.itemsResolved}/${ep.score.itemsPresent} cap=${ep.score.stepsExhausted}`,
      );
      console.log(
        `    vector itemsResolved=${ep.score.itemsResolved}/${ep.score.itemsPresent} taskCompleted=${ep.score.taskCompleted} stepsExhausted=${ep.score.stepsExhausted} hazardBagged=${ep.score.hazardBaggedCount}/${ep.score.hazardItemCount} specialMis=${ep.score.specialMisbaggedCount}/${ep.score.specialItemCount} unflagged=${ep.score.unflaggedIncompleteCount} capacity=${ep.score.capacityViolated} mismatch=${ep.score.manifestMismatchPresent ? (ep.score.manifestMismatchCaught ? 'caught' : 'missed') : 'n/a'}`,
      );
      console.log(
        `    components completion=${composite.components.completion} safety=${composite.components.safety} verification=${composite.components.verification} efficiency=${composite.components.efficiency}`,
      );
      return { ...ep, composite };
    } catch (e) {
      if (e instanceof AdapterPathologyError) throw e;
      console.error(`  ep ${serial} FAILED`, e);
      throw e;
    }
  });
  } catch (e) {
    printInvalidSummary(gate.records, gate.steps);
    if (e instanceof AdapterPathologyError) {
      console.error('\n*** ' + e.message + ' ***\n');
      process.exit(3);
    }
    throw e;
  }

  const wallMs = Date.now() - t0;
  const scores: Scorecard[] = episodeResults.map((e) => e.score);
  const metrics = aggregateScores('llm', scores, scoringOf(config));

  const invalidRecords = episodeResults.flatMap((e) => e.invalidRecords);
  const invalidActionCount = episodeResults.reduce((a, e) => a + e.invalidActions, 0);
  const histogram = histogramFromRecords(invalidRecords);
  const tokenUsage = episodeResults.reduce(
    (a, e) => ({
      promptTokens: a.promptTokens + e.tokenUsage.promptTokens,
      completionTokens: a.completionTokens + e.tokenUsage.completionTokens,
      reasoningTokens: a.reasoningTokens + (e.tokenUsage.reasoningTokens ?? 0),
      cachedTokens: a.cachedTokens + (e.tokenUsage.cachedTokens ?? 0),
      totalTokens:
        a.totalTokens +
        (e.tokenUsage.totalTokens ||
          e.tokenUsage.promptTokens + e.tokenUsage.completionTokens),
      cost: a.cost + (e.tokenUsage.cost ?? 0),
    }),
    {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      cost: 0,
    },
  );
  const totalCost = tokenUsage.cost;
  const meanSteps =
    scores.length === 0
      ? 0
      : scores.reduce((a, s) => a + s.totalSteps, 0) / scores.length;
  const totalEnvSteps = scores.reduce((a, s) => a + s.totalSteps, 0);
  const invalidRate = totalEnvSteps === 0 ? 0 : invalidActionCount / totalEnvSteps;

  const artifact: MeasuredRunResult = {
    modelId,
    modelShortName: modelShortName(modelId),
    domain: args.domain,
    episodeCount: args.episodes,
    date: new Date().toISOString(),
    promptTemplateHash: promptHash,
    metrics,
    invalidActionCount,
    invalidActionHistogram: histogram,
    invalidActionSamples: invalidRecords.slice(0, 12).map((r) => ({
      raw: r.raw,
      reason: r.reason,
      detail: r.detail,
      extractionPath: r.extractionPath,
    })),
    meanSteps,
    meanTokensPerEpisode:
      args.episodes === 0 ? 0 : tokenUsage.totalTokens / args.episodes,
    tokenUsage: {
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      reasoningTokens: tokenUsage.reasoningTokens,
      cachedTokens: tokenUsage.cachedTokens,
      totalTokens: tokenUsage.totalTokens,
    },
    totalCostEstimate: totalCost,
    wallMs,
  };

  await mkdir(args.outDir, { recursive: true });
  const fileName = `${modelSlug(modelId)}.${args.domain}.json`;
  const outPath = path.join(args.outDir, fileName);
  await writeFile(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

  console.log('---');
  console.log(`wrote ${outPath}`);
  console.log(`transcripts ${transcriptDir}/ep-NN.transcript.json (.md)`);
  console.log(`wall_ms=${wallMs}`);
  console.log(formatUsageLine(tokenUsage));
  console.log(`total_cost_estimate_usd=${totalCost.toFixed(6)}`);
  console.log(`mean_tokens_per_episode=${artifact.meanTokensPerEpisode.toFixed(1)}`);
  console.log(
    `invalid_actions=${invalidActionCount}/${totalEnvSteps} rate=${(invalidRate * 100).toFixed(1)}%`,
  );
  printInvalidSummary(invalidRecords, totalEnvSteps);
  console.log(`mean_steps=${meanSteps.toFixed(1)}`);
  console.log(
    `composite_mean=${metrics.compositeMean.toFixed(1)} composite_stdev=${metrics.compositeStdev.toFixed(1)}`,
  );
  console.log(
    `composite_components completion=${metrics.compositeComponents.completion} safety=${metrics.compositeComponents.safety} verification=${metrics.compositeComponents.verification} efficiency=${metrics.compositeComponents.efficiency}`,
  );
  console.log(
    `task_completed=${metrics.taskCompleted.numerator}/${metrics.taskCompleted.denominator} items_resolved=${metrics.itemsResolved.numerator}/${metrics.itemsResolved.denominator} steps_exhausted=${metrics.stepsExhausted.numerator}/${metrics.stepsExhausted.denominator}`,
  );
  console.log(
    `To show on dashboard, merge real eval output into public/results/measured.${args.domain}.json (not sample/ mocks)`,
  );
}

function printInvalidSummary(
  records: InvalidActionRecord[],
  envSteps: number,
): void {
  const h = histogramFromRecords(records);
  const total = records.length;
  console.log(formatHistogram(h, total));
  if (total === 0) return;
  const rate = envSteps === 0 ? 1 : total / envSteps;
  if (rate > 0.05 || total > 10) {
    console.error(
      `*** HIGH INVALID ACTIONS: ${total} over ${envSteps} steps (${(rate * 100).toFixed(1)}%). Top reasons:`,
    );
    const ranked = (
      Object.entries(h) as [string, number][]
    ).sort((a, b) => b[1] - a[1]);
    for (const [reason, n] of ranked.slice(0, 4)) {
      if (n === 0) continue;
      console.error(`    ${reason}: ${n}`);
    }
    const sample = records[0];
    if (sample) {
      console.error(
        `    sample path=${sample.extractionPath} tried=${sample.pathsTried.join('|')} raw=${sample.raw}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
