import type { ActionKind, EpisodeState, TaskConfig } from '../../types';
import type { PlannerAction } from './types';
import {
  ACTION_KINDS,
  formatPlannerUserMessage,
  serializePlannerView,
} from './serialize';
import {
  extractLlmAction,
  recordFromFailure,
  type ExtractionPath,
  type InvalidActionRecord,
  type LlmActionJson,
} from './parseAction';
import { addUsage, emptyUsage } from './usage';

export type { LlmActionJson, ExtractionPath, InvalidActionRecord };
export { extractLlmAction } from './parseAction';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  /** USD from the provider payload when present — never a local price table. */
  cost?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage: ChatCompletionUsage;
  /** Ignored for action parse; logged when content is empty. */
  reasoning?: string;
  contentSource?: string;
}

/** Injected by the Node driver — never implemented under Vite src network calls. */
export type ChatCompleteFn = (
  messages: ChatMessage[],
) => Promise<ChatCompletionResult>;

export interface LlmStepResult {
  action: PlannerAction;
  /** Parsed / applied JSON the env actually used (noop inspect on hard fail). */
  draft: LlmActionJson;
  validationError: string | null;
  invalidAction: boolean;
  usage: ChatCompletionUsage;
  rawResponses: string[];
  extractionPath: ExtractionPath;
  invalidRecord: InvalidActionRecord | null;
}

export const MOTOR_NEEDS_ITEM: ActionKind[] = [
  'pick',
  'prepare',
  'finish',
  'place',
  'setAside',
  'reposition',
  'placeIncomplete',
];

export function parseLlmActionJson(raw: string): LlmActionJson {
  const extracted = extractLlmAction(raw);
  if (!extracted.draft) {
    throw new Error(extracted.error ?? 'unparseable JSON');
  }
  return extracted.draft;
}

export function validateLlmAction(
  draft: LlmActionJson,
  state: EpisodeState,
  config: TaskConfig,
): string | null {
  if (!ACTION_KINDS.includes(draft.action)) {
    return `illegal action kind "${draft.action}"; allowed: ${ACTION_KINDS.join(', ')}`;
  }

  if (MOTOR_NEEDS_ITEM.includes(draft.action)) {
    if (!draft.itemId) {
      return `action ${draft.action} requires itemId`;
    }
    if (!state.seedData.items.some((i) => i.id === draft.itemId)) {
      return `unknown itemId "${draft.itemId}"`;
    }
    if (
      state.seedData.streamEnabled &&
      !state.visibleItemIds.includes(draft.itemId)
    ) {
      return `itemId "${draft.itemId}" has not arrived yet`;
    }
  }

  if (draft.skillId) {
    if (!config.skills.some((s) => s.id === draft.skillId)) {
      return `unknown skillId "${draft.skillId}"`;
    }
  }

  if (
    MOTOR_NEEDS_ITEM.includes(draft.action) &&
    draft.action !== 'reposition' &&
    !draft.skillId
  ) {
    // Infer default skill from kind/role when omitted
    const roleMap: Partial<Record<ActionKind, string>> = {
      pick: 'pick',
      prepare: 'prepare',
      finish: 'finish',
      place: 'place',
      setAside: 'setAside',
      placeIncomplete: 'place',
    };
    const role = roleMap[draft.action];
    const skill = config.skills.find((s) => s.role === role);
    if (!skill) {
      return `action ${draft.action} requires skillId`;
    }
  }

  if (draft.action === 'reposition' && !draft.skillId) {
    const last = state.actions[state.actions.length - 1];
    if (!last?.skillId) {
      return 'reposition requires skillId when no prior motor skill';
    }
  }

  if (draft.action === 'openContainer') {
    if (state.containers.length >= config.containers.maxContainers) {
      return `cannot openContainer: already at maxContainers=${config.containers.maxContainers}`;
    }
  }

  if (draft.containerId) {
    if (!state.containers.some((c) => c.id === draft.containerId)) {
      return `unknown containerId "${draft.containerId}"`;
    }
    if (draft.action !== 'place' && draft.action !== 'placeIncomplete') {
      return `containerId is only valid on place / placeIncomplete`;
    }
  }

  if (draft.orderId) {
    if (!state.seedData.orders.some((o) => o.id === draft.orderId)) {
      return `unknown orderId "${draft.orderId}"`;
    }
    if (draft.action !== 'openContainer') {
      return `orderId is only valid on openContainer`;
    }
  }

  return null;
}

export function toPlannerAction(
  draft: LlmActionJson,
  state: EpisodeState,
  config: TaskConfig,
): PlannerAction {
  let skillId = draft.skillId;
  if (!skillId && MOTOR_NEEDS_ITEM.includes(draft.action)) {
    if (draft.action === 'reposition') {
      skillId = state.actions[state.actions.length - 1]?.skillId;
    } else {
      const roleMap: Partial<Record<ActionKind, string>> = {
        pick: 'pick',
        prepare: 'prepare',
        finish: 'finish',
        place: 'place',
        setAside: 'setAside',
        placeIncomplete: 'place',
      };
      const role = roleMap[draft.action];
      skillId = config.skills.find((s) => s.role === role)?.id;
    }
  }

  const flagIncomplete =
    draft.action === 'placeIncomplete'
      ? Boolean(draft.flagIncomplete)
      : undefined;

  const meta: PlannerAction['meta'] = {};
  if (draft.action === 'openContainer') {
    meta.openContainer = true;
  }
  if (draft.action === 'checkManifest') {
    // Choosing to verify catches a real discrepancy
    meta.catchMismatch = state.seedData.hasManifestMismatch;
  }
  if (draft.action === 'placeIncomplete') {
    meta.placeIncomplete = true;
    meta.flagIncomplete = flagIncomplete;
    meta.markRecoveryAttempt = true;
    if (flagIncomplete) meta.markRecoverySuccess = true;
  }
  if (draft.action === 'reposition') {
    meta.markRecoveryAttempt = true;
  }
  if (draft.action === 'escalate' && draft.itemId) {
    // Park item via runner escalate+item path (see runner)
    meta.markRecoveryAttempt = true;
  }
  if (draft.flagShortShip) meta.flagShortShip = true;
  if (draft.holdShort) meta.holdShort = true;

  return {
    kind: draft.action,
    skillId,
    itemId: draft.itemId,
    containerId: draft.containerId,
    orderId: draft.orderId,
    plannerLines: [draft.reason],
    meta: Object.keys(meta).length ? meta : undefined,
  };
}

function noopInspectAction(reason: string): PlannerAction {
  return {
    kind: 'reInspect',
    plannerLines: [reason],
  };
}

/**
 * One planner step via chat completion. Retries once on invalid JSON/action.
 * On second failure: invalidAction + no-op reInspect.
 */
export async function llmPlanStep(
  state: EpisodeState,
  config: TaskConfig,
  systemPrompt: string,
  chat: ChatCompleteFn,
): Promise<LlmStepResult> {
  const userPayload = formatPlannerUserMessage(state, config);
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        'Given the current planner-visible state JSON below, reply with ONLY a single JSON object:\n' +
        '{"action": <kind>, "skillId"?: string, "itemId"?: string, "reason": <one line>, "flagIncomplete"?: boolean}\n\n' +
        userPayload,
    },
  ];

  const rawResponses: string[] = [];
  let usage = emptyUsage();

  type Attempt =
    | {
        ok: true;
        action: PlannerAction;
        draft: LlmActionJson;
        extractionPath: ExtractionPath;
      }
    | {
        ok: false;
        error: string;
        draft: LlmActionJson | null;
        extractionPath: ExtractionPath;
        invalidRecord: InvalidActionRecord;
      };

  const attempt = async (messages: ChatMessage[]): Promise<Attempt> => {
    const result = await chat(messages);
    usage = addUsage(usage, result.usage);
    const raw = result.content || '';
    rawResponses.push(raw);
    const extracted = extractLlmAction(raw);
    if (!extracted.draft) {
      const emptyNote =
        !raw.trim() && result.reasoning
          ? ` (content empty, reasoning ${result.reasoning.length} chars ignored)`
          : '';
      const error = (extracted.error ?? 'unparseable JSON') + emptyNote;
      return {
        ok: false,
        error,
        draft: null,
        extractionPath: extracted.path,
        invalidRecord: recordFromFailure(raw || result.reasoning || '', {
          ...extracted,
          error,
        }),
      };
    }
    const err = validateLlmAction(extracted.draft, state, config);
    if (err) {
      return {
        ok: false,
        error: err,
        draft: extracted.draft,
        extractionPath: extracted.path,
        invalidRecord: recordFromFailure(raw, extracted, err),
      };
    }
    return {
      ok: true,
      action: toPlannerAction(extracted.draft, state, config),
      draft: extracted.draft,
      extractionPath: extracted.path,
    };
  };

  const first = await attempt(baseMessages);
  if (first.ok) {
    return {
      action: first.action,
      draft: first.draft,
      validationError: null,
      invalidAction: false,
      usage,
      rawResponses,
      extractionPath: first.extractionPath,
      invalidRecord: null,
    };
  }

  const retryMessages: ChatMessage[] = [
    ...baseMessages,
    { role: 'assistant', content: rawResponses[0] ?? '' },
    {
      role: 'user',
      content:
        `Validation error: ${first.error}. Reply again with ONLY valid JSON for one legal action.`,
    },
  ];
  const second = await attempt(retryMessages);
  if (second.ok) {
    return {
      action: second.action,
      draft: second.draft,
      validationError: null,
      invalidAction: false,
      usage,
      rawResponses,
      extractionPath: second.extractionPath,
      invalidRecord: null,
    };
  }

  const noop = noopInspectAction(
    `invalidAction: ${second.error} (after retry) — no-op inspect`,
  );
  return {
    action: noop,
    draft: {
      action: 'reInspect',
      reason: noop.plannerLines[0] ?? 'invalidAction no-op inspect',
    },
    validationError: second.error,
    invalidAction: true,
    usage,
    rawResponses,
    extractionPath: second.extractionPath,
    invalidRecord: second.invalidRecord,
  };
}

export { serializePlannerView, formatPlannerUserMessage };
