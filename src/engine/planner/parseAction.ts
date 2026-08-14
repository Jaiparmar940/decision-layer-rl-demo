import type { ActionKind } from '../../types';
import { ACTION_KINDS } from './serialize';

export interface LlmActionJson {
  action: ActionKind;
  skillId?: string;
  itemId?: string | null;
  /** Optional target container for place / placeIncomplete (defaults to active). */
  containerId?: string;
  reason: string;
  flagIncomplete?: boolean;
}

export type ExtractionPath = 'direct' | 'fence' | 'balanced' | 'none';

export type InvalidFailureReason =
  | 'unparseable'
  | 'unknown_kind'
  | 'illegal_params'
  | 'missing_target';

export interface InvalidActionRecord {
  raw: string;
  reason: InvalidFailureReason;
  detail: string;
  extractionPath: ExtractionPath;
  pathsTried: ExtractionPath[];
}

export interface ExtractResult {
  draft: LlmActionJson | null;
  path: ExtractionPath;
  pathsTried: ExtractionPath[];
  error: string | null;
}

const KIND_ALIASES: Record<string, ActionKind> = (() => {
  const map: Record<string, ActionKind> = {};
  const add = (alias: string, kind: ActionKind) => {
    map[alias] = kind;
    map[alias.replace(/[_-]/g, '')] = kind;
  };
  for (const kind of ACTION_KINDS) {
    add(kind.toLowerCase(), kind);
    add(kind.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, ''), kind);
    add(kind.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''), kind);
  }
  return map;
})();

export function normalizeActionKind(raw: string): ActionKind | null {
  const key = raw.trim().toLowerCase();
  return KIND_ALIASES[key] ?? KIND_ALIASES[key.replace(/[_-]/g, '')] ?? null;
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  }
  return undefined;
}

function pickOptionalString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') return v;
    if (v === null) return undefined;
  }
  return undefined;
}

function lastFencedBlock(text: string): string | null {
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    last = m[1]!.trim();
  }
  if (last) return last;
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return null;
}

/** Last complete top-level `{...}` in the text, string-aware. */
export function lastBalancedObject(text: string): string | null {
  const starts: number[] = [];
  let inStr = false;
  let esc = false;
  let last: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') starts.push(i);
    if (ch === '}' && starts.length > 0) {
      const s = starts.pop()!;
      if (starts.length === 0) last = text.slice(s, i + 1);
    }
  }
  return last;
}

function draftFromObject(obj: Record<string, unknown>): LlmActionJson {
  const kindRaw = pickString(obj, ['action', 'kind', 'Action', 'Kind']);
  if (!kindRaw) {
    throw new Error('missing string field "action" or "kind"');
  }
  const kind = normalizeActionKind(kindRaw);
  if (!kind) {
    throw new Error(`illegal action kind "${kindRaw}"`);
  }
  const reason =
    pickOptionalString(obj, ['reason', 'Reason']) ?? '';
  const itemRaw = pickOptionalString(obj, ['itemId', 'item_id', 'item-id']);
  const flagRaw = obj.flagIncomplete ?? obj.flag_incomplete ?? obj['flag-incomplete'];
  return {
    action: kind,
    skillId: pickOptionalString(obj, ['skillId', 'skill_id', 'skill-id']),
    itemId: itemRaw === undefined ? undefined : itemRaw,
    containerId: pickOptionalString(obj, [
      'containerId',
      'container_id',
      'container-id',
    ]),
    reason,
    flagIncomplete: typeof flagRaw === 'boolean' ? flagRaw : undefined,
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('response is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Extract an action JSON from a model response.
 * Order: direct parse → fenced block → last balanced `{...}`.
 * Mapping (kind aliases / action|kind keys) runs only after a JSON object is found.
 */
export function extractLlmAction(raw: string): ExtractResult {
  const text = (raw ?? '').trim();
  const pathsTried: ExtractionPath[] = [];

  const tryPath = (
    path: ExtractionPath,
    candidate: string | null,
  ): { obj: Record<string, unknown>; path: ExtractionPath } | null => {
    if (candidate == null || candidate === '') return null;
    pathsTried.push(path);
    try {
      return { obj: parseJsonObject(candidate), path };
    } catch {
      return null;
    }
  };

  const found =
    tryPath('direct', text) ??
    tryPath('fence', lastFencedBlock(text)) ??
    tryPath('balanced', lastBalancedObject(text));

  if (!found) {
    let error = 'unparseable JSON';
    try {
      parseJsonObject(text);
    } catch (e) {
      error = e instanceof Error ? e.message : 'unparseable JSON';
    }
    return {
      draft: null,
      path: 'none',
      pathsTried: pathsTried.length ? pathsTried : ['direct'],
      error,
    };
  }

  try {
    return {
      draft: draftFromObject(found.obj),
      path: found.path,
      pathsTried: [...pathsTried],
      error: null,
    };
  } catch (e) {
    return {
      draft: null,
      path: found.path,
      pathsTried: [...pathsTried],
      error: e instanceof Error ? e.message : 'invalid action object',
    };
  }
}

export function truncateRaw(raw: string, max = 500): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function classifyValidationError(err: string): InvalidFailureReason {
  if (/illegal action kind|unknown kind|missing string field "action"/i.test(err)) {
    return 'unknown_kind';
  }
  if (
    /requires itemId|unknown itemId|unknown containerId|missing target/i.test(err)
  ) {
    return 'missing_target';
  }
  if (/unparseable|JSON|not a JSON object/i.test(err)) {
    return 'unparseable';
  }
  return 'illegal_params';
}

export class AdapterPathologyError extends Error {
  readonly invalid: number;
  readonly steps: number;
  constructor(invalid: number, steps: number) {
    super(
      `ADAPTER PATHOLOGY: ${invalid}/${steps} invalid actions in the first ${steps} steps (${Math.round((invalid / steps) * 100)}%). Likely adapter/format mismatch, not model behavior. Aborting to avoid burning spend.`,
    );
    this.name = 'AdapterPathologyError';
    this.invalid = invalid;
    this.steps = steps;
  }
}

export const PATHOLOGY_WINDOW = 10;
export const PATHOLOGY_RATE = 0.25;

export type InvalidHistogram = Record<InvalidFailureReason, number>;

export function emptyHistogram(): InvalidHistogram {
  return {
    unparseable: 0,
    unknown_kind: 0,
    illegal_params: 0,
    missing_target: 0,
  };
}

export function histogramFromRecords(
  records: InvalidActionRecord[],
): InvalidHistogram {
  const h = emptyHistogram();
  for (const r of records) h[r.reason] += 1;
  return h;
}

export function mergeHistograms(
  a: InvalidHistogram,
  b: InvalidHistogram,
): InvalidHistogram {
  return {
    unparseable: a.unparseable + b.unparseable,
    unknown_kind: a.unknown_kind + b.unknown_kind,
    illegal_params: a.illegal_params + b.illegal_params,
    missing_target: a.missing_target + b.missing_target,
  };
}

export function recordFromFailure(
  raw: string,
  extracted: ExtractResult,
  validationError?: string | null,
): InvalidActionRecord {
  const detail = validationError ?? extracted.error ?? 'unparseable JSON';
  const reason: InvalidFailureReason =
    extracted.path === 'none' && !validationError
      ? 'unparseable'
      : classifyValidationError(detail);
  return {
    raw: truncateRaw(raw),
    reason,
    detail,
    extractionPath: extracted.path,
    pathsTried: extracted.pathsTried,
  };
}

export interface PlannerStepInfo {
  extractionPath: ExtractionPath;
  invalid: boolean;
  invalidRecord: InvalidActionRecord | null;
}

export function createPathologyGate(opts?: {
  window?: number;
  rate?: number;
}): {
  steps: number;
  invalid: number;
  records: InvalidActionRecord[];
  error: AdapterPathologyError | null;
  throwIfAborted: () => void;
  onPlannerStep: (info: PlannerStepInfo) => void;
} {
  const window = opts?.window ?? PATHOLOGY_WINDOW;
  const rate = opts?.rate ?? PATHOLOGY_RATE;
  const gate = {
    steps: 0,
    invalid: 0,
    records: [] as InvalidActionRecord[],
    error: null as AdapterPathologyError | null,
    throwIfAborted() {
      if (gate.error) throw gate.error;
    },
    onPlannerStep(info: PlannerStepInfo) {
      if (gate.error) throw gate.error;
      const n = ++gate.steps;
      if (info.invalid) gate.invalid += 1;
      if (info.invalidRecord) gate.records.push(info.invalidRecord);
      if (n === window && gate.invalid / window > rate) {
        gate.error = new AdapterPathologyError(gate.invalid, window);
        throw gate.error;
      }
    },
  };
  return gate;
}

export function formatHistogram(h: InvalidHistogram, totalInvalid: number): string {
  const rows = (
    Object.entries(h) as [InvalidFailureReason, number][]
  ).sort((a, b) => b[1] - a[1]);
  const lines = rows.map(([reason, n]) => {
    const pct = totalInvalid === 0 ? 0 : Math.round((n / totalInvalid) * 100);
    return `  ${reason}: ${n} (${pct}%)`;
  });
  return [`invalid_action_histogram total=${totalInvalid}`, ...lines].join('\n');
}
