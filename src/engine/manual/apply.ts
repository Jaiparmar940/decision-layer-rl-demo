import type { EpisodeState, TaskConfig, TraceLine } from '../../types';
import type { Rng } from '../rng';
import {
  formatPlannerUserMessage,
  serializePlannerView,
  type SerializedPlannerView,
} from '../planner/serialize';
import {
  toPlannerAction,
  validateLlmAction,
  type LlmActionJson,
} from '../planner/llm';
import { applyPlannerAction } from '../runner';
import type { TranscriptStep } from '../transcript';

export const MANUAL_EXECUTOR_SALT = 'manual-run';

export interface ManualApplyResult {
  payloadText: string;
  payload: SerializedPlannerView;
  validationError: string | null;
  applied: boolean;
  plannerLines: TraceLine[];
  executorLines: TraceLine[];
  step: TranscriptStep;
}

/**
 * One manual / preset / LLM-adapter step: serialize → validate → applyPlannerAction.
 * Payload is captured *before* the action, matching eval-llm user message.
 */
export function applyManualDraft(
  state: EpisodeState,
  config: TaskConfig,
  draft: LlmActionJson,
  rng: Rng,
  maxSteps: number,
): ManualApplyResult {
  const payloadText = formatPlannerUserMessage(state, config);
  const payload = serializePlannerView(state, config);
  const validationError = validateLlmAction(draft, state, config);
  const index = state.actions.length;

  if (validationError) {
    const step: TranscriptStep = {
      index,
      payloadText,
      payload,
      action: draft,
      validationError,
      applied: false,
      outcome: null,
    };
    return {
      payloadText,
      payload,
      validationError,
      applied: false,
      plannerLines: [],
      executorLines: [],
      step,
    };
  }

  const actionsBefore = state.actions.length;
  const execBefore = state.executorLines.length;
  const action = toPlannerAction(draft, state, config);
  const { plannerLines, executorLines } = applyPlannerAction(
    state,
    config,
    action,
    rng,
    maxSteps,
  );
  const record = state.actions[state.actions.length - 1] ?? null;
  const newExec = state.executorLines.slice(execBefore).map((l) => l.text);

  const step: TranscriptStep = {
    index,
    payloadText,
    payload,
    action: draft,
    validationError: null,
    applied: state.actions.length > actionsBefore,
    outcome: record
      ? {
          step: record.step,
          success: record.success,
          motor: record.motor,
          observation: record.observation,
          executorLines: newExec,
          record,
        }
      : {
          step: state.step,
          success: true,
          motor: false,
          executorLines: newExec,
          record: null,
        },
  };

  return {
    payloadText,
    payload,
    validationError: null,
    applied: true,
    plannerLines,
    executorLines,
    step,
  };
}
