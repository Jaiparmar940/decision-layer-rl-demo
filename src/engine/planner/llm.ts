import type { ActionKind, EpisodeState, TaskConfig } from '../../types';
import type { PlannerAction } from './types';
import {
  ACTION_KINDS,
  formatPlannerUserMessage,
  serializePlannerView,
} from './serialize';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  /** USD estimate if provider reports it */
  cost?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage: ChatCompletionUsage;
}

/** Injected by the Node driver — never implemented under Vite src network calls. */
export type ChatCompleteFn = (
  messages: ChatMessage[],
) => Promise<ChatCompletionResult>;

export interface LlmStepResult {
  action: PlannerAction;
  invalidAction: boolean;
  usage: ChatCompletionUsage;
  rawResponses: string[];
}

export interface LlmActionJson {
  action: ActionKind;
  skillId?: string;
  itemId?: string | null;
  /** Optional target container for place / placeIncomplete (defaults to active). */
  containerId?: string;
  reason: string;
  flagIncomplete?: boolean;
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
  let text = raw.trim();
  // Strip common markdown fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('response is not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.action !== 'string') {
    throw new Error('missing string field "action"');
  }
  if (typeof obj.reason !== 'string') {
    throw new Error('missing string field "reason"');
  }
  return {
    action: obj.action as ActionKind,
    skillId: typeof obj.skillId === 'string' ? obj.skillId : undefined,
    itemId:
      obj.itemId === null || obj.itemId === undefined
        ? (obj.itemId as null | undefined)
        : String(obj.itemId),
    containerId:
      typeof obj.containerId === 'string' ? obj.containerId : undefined,
    reason: obj.reason,
    flagIncomplete:
      typeof obj.flagIncomplete === 'boolean' ? obj.flagIncomplete : undefined,
  };
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

  return {
    kind: draft.action,
    skillId,
    itemId: draft.itemId,
    containerId: draft.containerId,
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

function emptyUsage(): ChatCompletionUsage {
  return { promptTokens: 0, completionTokens: 0, cost: 0 };
}

function addUsage(
  a: ChatCompletionUsage,
  b: ChatCompletionUsage,
): ChatCompletionUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    cost: (a.cost ?? 0) + (b.cost ?? 0),
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

  const attempt = async (
    messages: ChatMessage[],
  ): Promise<{ ok: true; action: PlannerAction } | { ok: false; error: string }> => {
    const result = await chat(messages);
    usage = addUsage(usage, result.usage);
    rawResponses.push(result.content);
    try {
      const draft = parseLlmActionJson(result.content);
      const err = validateLlmAction(draft, state, config);
      if (err) return { ok: false, error: err };
      return { ok: true, action: toPlannerAction(draft, state, config) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'invalid JSON',
      };
    }
  };

  const first = await attempt(baseMessages);
  if (first.ok) {
    return { action: first.action, invalidAction: false, usage, rawResponses };
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
    return { action: second.action, invalidAction: false, usage, rawResponses };
  }

  return {
    action: noopInspectAction(
      `invalidAction: ${second.error} (after retry) — no-op inspect`,
    ),
    invalidAction: true,
    usage,
    rawResponses,
  };
}

export { serializePlannerView, formatPlannerUserMessage };
