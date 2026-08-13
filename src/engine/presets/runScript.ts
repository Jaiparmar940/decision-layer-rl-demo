import type { TaskConfig } from '../../types';
import type { LlmActionJson } from '../planner/llm';
import { createInitialState, generateEpisodeSeed } from '../episode';
import { deriveLlmExecutorStream } from '../rng';
import { scoreEpisode } from '../score';
import { applyManualDraft, MANUAL_EXECUTOR_SALT } from '../manual/apply';
import { LLM_MAX_STEPS } from '../runner';
import type { EpisodeTranscript } from '../transcript';
import { transcriptEndedBy } from '../transcript';
import {
  nextNegligentAction,
  nextPerfectAction,
  nextRecoveryAction,
} from './policies';

export type PresetKind = 'perfect' | 'negligent' | 'recovery';

export interface PresetFixture {
  id: string;
  domain: string;
  kind: PresetKind;
  masterSeed: number;
  maxSteps: number;
  actions: LlmActionJson[];
}

export const PRESET_EXECUTOR_SALT = MANUAL_EXECUTOR_SALT;

export function runActionScript(
  config: TaskConfig,
  masterSeed: number,
  actions: LlmActionJson[],
  maxSteps: number = LLM_MAX_STEPS,
): EpisodeTranscript {
  const { seedData } = generateEpisodeSeed(config, masterSeed, 1);
  const state = createInitialState(seedData, 'llm', config);
  const rng = deriveLlmExecutorStream(masterSeed, PRESET_EXECUTOR_SALT);
  const steps = [];

  for (const draft of actions) {
    if (state.done) break;
    const result = applyManualDraft(state, config, draft, rng, maxSteps);
    steps.push(result.step);
    if (!result.applied) {
      throw new Error(
        `preset action rejected: ${result.validationError} (${JSON.stringify(draft)})`,
      );
    }
  }

  const score = state.done || state.step > 0 ? scoreEpisode(state, config) : null;
  return {
    schemaVersion: 1,
    source: 'preset',
    episodeId: seedData.episodeId,
    masterSeed,
    domain: config.meta.id,
    domainLabel: config.meta.domainLabel,
    maxSteps,
    steps,
    scorecard: score,
    endedBy: transcriptEndedBy(score, state.done),
  };
}

export function recordPolicy(
  config: TaskConfig,
  masterSeed: number,
  kind: PresetKind,
  maxSteps: number = LLM_MAX_STEPS,
): { fixture: PresetFixture; transcript: EpisodeTranscript } {
  const next =
    kind === 'perfect'
      ? nextPerfectAction
      : kind === 'negligent'
        ? nextNegligentAction
        : nextRecoveryAction;

  const { seedData } = generateEpisodeSeed(config, masterSeed, 1);
  const state = createInitialState(seedData, 'llm', config);
  const rng = deriveLlmExecutorStream(masterSeed, PRESET_EXECUTOR_SALT);
  const actions: LlmActionJson[] = [];
  const steps = [];

  let guard = 0;
  while (!state.done && guard++ < maxSteps + 5) {
    const draft = next(state, config);
    if (!draft) break;
    const result = applyManualDraft(state, config, draft, rng, maxSteps);
    if (!result.applied) {
      throw new Error(
        `${kind} policy illegal at seed ${masterSeed}: ${result.validationError} ${JSON.stringify(draft)}`,
      );
    }
    actions.push(draft);
    steps.push(result.step);
  }

  const score = scoreEpisode(state, config);
  const transcript: EpisodeTranscript = {
    schemaVersion: 1,
    source: 'preset',
    episodeId: seedData.episodeId,
    masterSeed,
    domain: config.meta.id,
    domainLabel: config.meta.domainLabel,
    maxSteps,
    presetId: `${config.meta.id}-${kind}`,
    steps,
    scorecard: score,
    endedBy: transcriptEndedBy(score, state.done),
  };

  return {
    fixture: {
      id: `${config.meta.id}-${kind}`,
      domain: config.meta.id,
      kind,
      masterSeed,
      maxSteps,
      actions,
    },
    transcript,
  };
}

export function presetMeetsKind(
  kind: PresetKind,
  t: EpisodeTranscript,
): string | null {
  const s = t.scorecard;
  if (!s) return 'no scorecard';
  if (kind === 'perfect') {
    if (s.unflaggedIncompleteCount > 0) return 'perfect: unflagged > 0';
    if (s.manifestMismatchPresent && !s.manifestMismatchCaught) {
      return 'perfect: mismatch missed';
    }
    if (s.hazardBaggedCount > 0) return 'perfect: hazard bagged';
    if (s.specialMisbagged) return 'perfect: special misbagged';
    if (s.capacityViolated) return 'perfect: capacity violated';
    if (s.misroutedItemCount > 0) return 'perfect: misrouted items';
    if (s.foreignObjectContainerized > 0) return 'perfect: foreign object containerized';
    if (s.unflaggedShortShip) return 'perfect: unflagged short-ship';
    if (s.hadExecutorFailure && !s.recoverySucceeded) {
      return 'perfect: recovery failed';
    }
    if (s.hadRepeatedFailure && !s.repeatedFailureHandledSafely) {
      return 'perfect: unsafe repeated failure';
    }
    return null;
  }
  if (kind === 'negligent') {
    if (s.manifestMismatchPresent && s.manifestMismatchCaught) {
      return 'negligent: mismatch was caught';
    }
    const hasViolation =
      s.unflaggedIncompleteCount > 0 ||
      s.unflaggedShortShip ||
      s.misroutedItemCount > 0 ||
      s.foreignObjectContainerized > 0;
    if (!hasViolation) {
      return 'negligent: no unflagged / misroute / short / foreign-bagged';
    }
    if (!s.manifestMismatchPresent && s.ordersTotal === 0) {
      return 'negligent: seed has no mismatch';
    }
    return null;
  }
  // recovery
  if (!s.hadRepeatedFailure) return 'recovery: no repeated failure';
  if (!s.repeatedFailureHandledSafely) {
    return 'recovery: not handled safely';
  }
  return null;
}

export function findSeedForKind(
  config: TaskConfig,
  kind: PresetKind,
  start = 1000,
  limit = 800,
): { fixture: PresetFixture; transcript: EpisodeTranscript } {
  for (let s = start; s < start + limit; s++) {
    try {
      const rec = recordPolicy(config, s, kind);
      const err = presetMeetsKind(kind, rec.transcript);
      if (!err) return rec;
    } catch {
      /* try next seed */
    }
  }
  throw new Error(`no seed for ${config.meta.id} ${kind} in ${start}..${start + limit}`);
}
