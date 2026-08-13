import type { MeasuredRunResult } from '../types';

/**
 * promptTemplateHash from scripts/eval-llm.ts:
 *   createHash('sha256').update(text).digest('hex').slice(0, 16)
 */
const EVAL_PROMPT_HASH_RE = /^[0-9a-f]{16}$/;

/** True if hash matches the 16-hex prefix produced by eval-llm.ts */
export function isValidEvalPromptHash(hash: unknown): boolean {
  return typeof hash === 'string' && EVAL_PROMPT_HASH_RE.test(hash);
}

/**
 * Keep only runs that look like real eval-llm artifacts.
 * Rejects sample/ model ids and non-eval prompt hashes (console.warn + skip).
 */
export function filterMeasuredRuns(
  rows: unknown[],
  warn: (msg: string) => void = console.warn,
): MeasuredRunResult[] {
  const out: MeasuredRunResult[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      warn('[measured] skip non-object entry');
      continue;
    }
    const r = row as Partial<MeasuredRunResult>;
    const modelId = typeof r.modelId === 'string' ? r.modelId : '';
    if (modelId.startsWith('sample/')) {
      warn(
        `[measured] skip fabricated entry modelId="${modelId}" (sample/ prefix)`,
      );
      continue;
    }
    if (!isValidEvalPromptHash(r.promptTemplateHash)) {
      warn(
        `[measured] skip entry modelId="${modelId || '?'}" — promptTemplateHash must be 16-char sha256 hex from eval-llm.ts (got ${JSON.stringify(r.promptTemplateHash)})`,
      );
      continue;
    }
    if (!r.metrics || typeof r.metrics !== 'object') {
      warn(`[measured] skip entry modelId="${modelId}" — missing metrics`);
      continue;
    }
    out.push(r as MeasuredRunResult);
  }
  return out;
}

/**
 * Load optional committed measured LLM results for a domain
 * (public/results/measured.<domain>.json). Missing file → null, no console noise.
 * Fabricated sample entries are filtered out with a warning.
 */
export async function loadMeasuredResults(
  domainId: string,
): Promise<MeasuredRunResult[] | null> {
  try {
    const url = `${import.meta.env.BASE_URL}results/measured.${domainId}.json`;
    const res = await fetch(url);
    // Absent file: silent (no console). Network 404 is expected until real evals land.
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;
    const filtered = filterMeasuredRuns(data);
    return filtered.length > 0 ? filtered : null;
  } catch {
    return null;
  }
}
