import type {
  ActionRecord,
  EpisodeResult,
  EpisodeState,
  ItemResolution,
  PolicyMode,
  TaskConfig,
  TraceLine,
} from '../types';
import * as T from '../copy/traces';
import {
  activeContainer,
  createInitialState,
  generateEpisodeSeed,
  getAttr,
  skillByRole,
  trueAttr,
} from './episode';
import { executeAction } from './executor';
import { createPlannerContext, getPlanner } from './planner';
import type { PlannerAction, PlannerEpisodeContext } from './planner/types';
import { deriveStreams, type Rng, type StreamBundle } from './rng';
import { scoreEpisode } from './score';

/** Default cap for scripted policies; LLM eval uses LLM_MAX_STEPS. */
export const SCRIPTED_MAX_STEPS = 200;
export const LLM_MAX_STEPS = 60;

let lineCounter = 0;
function mkLine(
  channel: TraceLine['channel'],
  text: string,
  step?: number,
): TraceLine {
  lineCounter += 1;
  return { id: `L${lineCounter}`, channel, text, step };
}

export interface RunOptions {
  config: TaskConfig;
  masterSeed: number;
  mode: PolicyMode;
  episodeSerial?: number;
  streams?: StreamBundle;
  onStep?: (snapshot: EpisodeLiveSnapshot) => void;
}

export interface EpisodeLiveSnapshot {
  state: EpisodeState;
  newPlannerLines: TraceLine[];
  newExecutorLines: TraceLine[];
  done: boolean;
}

export interface PolicyRolls {
  catchMismatch: boolean;
  setAsideHazard: boolean;
  detectSpecial: boolean;
  recoverySuccess: boolean;
  redundantReinspect: boolean;
  hazardGateAfterSpecialMiss: boolean;
  skipManifest: boolean;
  bagHazard: boolean;
  missSpecial: boolean;
}

export interface EpisodeResultExt extends EpisodeResult {
  rolls: PolicyRolls;
}

function policyRng(streams: StreamBundle, mode: PolicyMode): Rng {
  if (mode === 'baseline') return streams.streamExecutorBaseline;
  if (mode === 'trained') return streams.streamExecutorTrained;
  // LLM mode should pass an explicit rng; fall back to trained stream only if misused
  return streams.streamExecutorTrained;
}

function rollsFromCtx(ctx: PlannerEpisodeContext): PolicyRolls {
  return {
    catchMismatch: ctx.catchMismatch,
    setAsideHazard: ctx.setAsideHazard,
    detectSpecial: ctx.detectSpecial,
    recoverySuccess: ctx.recoverySuccess,
    redundantReinspect: ctx.redundantReinspect,
    hazardGateAfterSpecialMiss: ctx.hazardGateAfterSpecialMiss,
    skipManifest: ctx.skipManifest,
    bagHazard: ctx.bagHazard,
    missSpecial: ctx.missSpecial,
  };
}

function applyBeliefInspect(state: EpisodeState): void {
  for (const it of state.seedData.items) {
    const b = state.beliefs.find((x) => x.itemId === it.id)!;
    b.inspected = true;
    b.attributeId = it.attributeId;
  }
}

function setResolution(
  state: EpisodeState,
  itemId: string,
  res: ItemResolution,
): void {
  state.itemResolution[itemId] = res;
}

function noteFailStreak(state: EpisodeState, itemId: string, streak: number): void {
  const prev = state.maxFailStreak[itemId] ?? 0;
  if (streak > prev) state.maxFailStreak[itemId] = streak;
  if (streak >= 2) state.flags.hadRepeatedFailure = true;
}

function placeItem(
  state: EpisodeState,
  config: TaskConfig,
  itemId: string,
): void {
  const c = activeContainer(state);
  if (c.itemIds.length >= c.capacity) {
    state.flags.capacityViolated = true;
  }
  if (!c.itemIds.includes(itemId)) {
    c.itemIds.push(itemId);
  }
  state.itemPhase[itemId] = 'placed';
  state.heldItemId = null;
  state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);

  const attr = getAttr(config, trueAttr(state, itemId));
  if (attr.hazard) state.flags.hazardBaggedCount += 1;
  if (attr.special) state.flags.specialMisbagged = true;
}

function applyMotorSuccess(
  state: EpisodeState,
  config: TaskConfig,
  kind: string,
  skillId: string | undefined,
  itemId: string | null | undefined,
  opts?: {
    placeIncomplete?: boolean;
    flagged?: boolean;
    hadPriorFail?: boolean;
  },
): void {
  if (!itemId) return;

  const isSetAside =
    kind === 'setAside' || skillByRole(config, 'setAside')?.id === skillId;
  if (isSetAside) {
    state.itemPhase[itemId] = 'aside';
    if (!state.setAsideIds.includes(itemId)) state.setAsideIds.push(itemId);
    state.heldItemId = null;
    state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);
    setResolution(state, itemId, 'set_aside');
    return;
  }

  if (kind === 'pick' || skillByRole(config, 'pick')?.id === skillId) {
    state.itemPhase[itemId] = 'picked';
    state.heldItemId = itemId;
    if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
    return;
  }

  if (kind === 'prepare' || skillByRole(config, 'prepare')?.id === skillId) {
    state.itemPhase[itemId] = 'prepared';
    if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
    return;
  }

  if (kind === 'finish' || skillByRole(config, 'finish')?.id === skillId) {
    state.itemPhase[itemId] = 'finished';
    if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
    return;
  }

  if (
    kind === 'place' ||
    kind === 'placeIncomplete' ||
    kind === 'reposition' ||
    skillByRole(config, 'place')?.id === skillId ||
    opts?.placeIncomplete
  ) {
    if (kind === 'reposition' && skillId) {
      const skill = config.skills.find((s) => s.id === skillId);
      if (skill?.role === 'pick') {
        state.itemPhase[itemId] = 'picked';
        state.heldItemId = itemId;
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        return;
      }
      if (skill?.role === 'prepare') {
        state.itemPhase[itemId] = 'prepared';
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        return;
      }
      if (skill?.role === 'finish') {
        state.itemPhase[itemId] = 'finished';
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        return;
      }
      if (skill?.role === 'setAside') {
        state.itemPhase[itemId] = 'aside';
        if (!state.setAsideIds.includes(itemId)) state.setAsideIds.push(itemId);
        state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);
        setResolution(state, itemId, 'set_aside');
        return;
      }
      if (skill?.role === 'place') {
        placeItem(state, config, itemId);
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        else if (state.itemResolution[itemId] === 'pending') {
          setResolution(state, itemId, 'normal');
        }
        return;
      }
    }

    if (opts?.placeIncomplete || kind === 'place' || kind === 'placeIncomplete') {
      placeItem(state, config, itemId);
      if (opts?.placeIncomplete) {
        if (opts.flagged) {
          state.flags.flaggedIncompleteCount += 1;
          setResolution(state, itemId, 'flagged_incomplete');
        } else {
          state.flags.unflaggedIncompleteCount += 1;
          setResolution(state, itemId, 'unflagged_incomplete');
        }
      } else if (opts?.hadPriorFail) {
        setResolution(state, itemId, 'retry_success');
      } else if (state.itemResolution[itemId] === 'pending') {
        setResolution(state, itemId, 'normal');
      }
    }
  }
}

function allItemsResolved(state: EpisodeState): boolean {
  return state.seedData.items.every((it) => {
    const p = state.itemPhase[it.id];
    return p === 'placed' || p === 'aside';
  });
}

/**
 * Apply a planner action to state (shared by scripted + LLM paths).
 */
export function applyPlannerAction(
  state: EpisodeState,
  config: TaskConfig,
  action: PlannerAction,
  rng: Rng,
  maxSteps: number = SCRIPTED_MAX_STEPS,
): { plannerLines: TraceLine[]; executorLines: TraceLine[] } {
  if (state.done) return { plannerLines: [], executorLines: [] };

  const newPlanner = action.plannerLines.map((t) =>
    mkLine('planner', t, state.step + 1),
  );
  state.plannerLines.push(...newPlanner);

  if (action.meta?.forceDone) {
    state.done = true;
    return { plannerLines: newPlanner, executorLines: [] };
  }

  // Escalate + itemId: park item (recovery give-up or deliberate handoff)
  if (action.kind === 'escalate' && action.itemId) {
    state.step += 1;
    state.flags.escalated = true;
    if (action.meta?.markRecoveryAttempt) {
      state.flags.recoveryAttempted = true;
    }
    const giveUp = Boolean(action.meta?.recoveryGiveUp);
    if (giveUp) state.flags.recoveryGiveUp = true;
    const execLines = [
      mkLine('executor', T.nonMotorExec('escalate-to-staff'), state.step),
    ];
    state.executorLines.push(...execLines);
    state.actions.push({
      step: state.step,
      kind: 'escalate',
      itemId: action.itemId,
      success: true,
      motor: false,
      recoveryGiveUp: giveUp || undefined,
      flagged: true,
    });
    if (state.itemPhase[action.itemId] !== 'placed') {
      state.itemPhase[action.itemId] = 'aside';
      if (!state.setAsideIds.includes(action.itemId)) {
        state.setAsideIds.push(action.itemId);
      }
      state.pendingItemQueue = state.pendingItemQueue.filter(
        (id) => id !== action.itemId,
      );
      const hadFail = (state.maxFailStreak[action.itemId] ?? 0) > 0;
      setResolution(
        state,
        action.itemId,
        giveUp || hadFail ? 'escalated_recovery' : 'set_aside',
      );
    }
    state.lastFailKey = null;
    for (const k of Object.keys(state.failCounts)) {
      if (k.endsWith(`:${action.itemId}`)) delete state.failCounts[k];
    }
    finishIfResolved(state, maxSteps);
    return { plannerLines: newPlanner, executorLines: execLines };
  }

  if (action.kind === 'openContainer' || action.meta?.openContainer) {
    state.step += 1;
    if (state.containers.length < config.containers.maxContainers) {
      state.containers.push({
        id: `c${state.containers.length}`,
        capacity: state.seedData.containerCapacity,
        itemIds: [],
      });
      state.flags.openedSecondContainer = true;
    }
    const execLines = [
      mkLine(
        'executor',
        T.nonMotorExec(`open ${config.containers.label}`),
        state.step,
      ),
    ];
    state.executorLines.push(...execLines);
    state.actions.push({
      step: state.step,
      kind: 'openContainer',
      success: true,
      motor: false,
    });
    finishIfResolved(state, maxSteps);
    return { plannerLines: newPlanner, executorLines: execLines };
  }

  // placeIncomplete is a recovery commit — always succeeds (no second motor roll)
  const forceOk = action.kind === 'placeIncomplete' || action.meta?.placeIncomplete;

  const execKind =
    action.kind === 'placeIncomplete'
      ? 'place'
      : action.kind === 'reposition'
        ? action.kind
        : action.kind;

  let exec = executeAction(
    state,
    config,
    {
      kind: execKind,
      skillId: action.skillId,
      itemId: action.itemId,
    },
    rng,
  );

  // Richer OBS for manifest check so planners can see claimed vs visible
  if (action.kind === 'checkManifest' && !action.meta?.skipManifest) {
    const claimed = state.seedData.manifestClaimed;
    const actual = state.seedData.items.length;
    const mismatch = claimed !== actual;
    exec = {
      success: true,
      motor: false,
      observation: `${config.manifest.label}: claimed=${claimed} visible=${actual}${mismatch ? ' MISMATCH' : ' OK'}`,
      executorLines: [
        T.nonMotorExec(`check ${config.manifest.label}`),
        `OBS: claimed ${claimed}, visible pile ${actual}${mismatch ? ' — mismatch' : ''}`,
      ],
    };
  }

  if (forceOk) {
    const itemLabel = action.itemId
      ? state.seedData.items.find((i) => i.id === action.itemId)?.label ?? 'item'
      : 'item';
    const skillLabel =
      config.skills.find((s) => s.id === action.skillId)?.label ?? 'place';
    exec = {
      success: true,
      motor: true,
      executorLines: [
        T.executorMotor(skillLabel, itemLabel, true),
        action.meta?.flagIncomplete || action.meta?.markRecoverySuccess
          ? T.nonMotorExec('flag incomplete placement')
          : T.nonMotorExec('force place incomplete (unflagged)'),
      ],
    };
  }

  state.step += 1;
  const execLines = exec.executorLines.map((t) =>
    mkLine('executor', t, state.step),
  );
  state.executorLines.push(...execLines);

  const isPlaceIncomplete =
    Boolean(action.meta?.placeIncomplete) || action.kind === 'placeIncomplete';
  const isFlaggedIncomplete = Boolean(
    isPlaceIncomplete && action.meta?.flagIncomplete,
  );
  const flagged =
    isFlaggedIncomplete ||
    Boolean(action.meta?.markRecoverySuccess && isPlaceIncomplete);

  const record: ActionRecord = {
    step: state.step,
    kind: action.kind,
    skillId: action.skillId,
    itemId: action.itemId,
    success: exec.success,
    motor: exec.motor,
    observation: exec.observation,
    placeIncomplete: isPlaceIncomplete,
    flagged: isPlaceIncomplete ? flagged : undefined,
    recoveryGiveUp: action.meta?.recoveryGiveUp,
  };
  state.actions.push(record);

  if (action.kind === 'checkManifest') {
    if (!action.meta?.skipManifest) {
      state.flags.manifestChecked = true;
    }
    if (action.meta?.catchMismatch) {
      state.flags.manifestMismatchCaught = true;
      state.flags.escalated = true;
    }
  }

  if (action.kind === 'reInspect') {
    applyBeliefInspect(state);
  }

  if (action.kind === 'escalate') {
    state.flags.escalated = true;
  }

  if (action.meta?.markRecoveryAttempt) {
    state.flags.recoveryAttempted = true;
  }

  if (exec.motor && !exec.success) {
    state.flags.hadExecutorFailure = true;
    const failKey = `${action.skillId}:${action.itemId ?? 'none'}`;
    const streak = (state.failCounts[failKey] ?? 0) + 1;
    state.failCounts[failKey] = streak;
    state.lastFailKey = failKey;
    if (action.itemId) noteFailStreak(state, action.itemId, streak);
  } else if (exec.motor && exec.success) {
    const failKey = `${action.skillId}:${action.itemId ?? 'none'}`;
    const hadPriorFail = (state.failCounts[failKey] ?? 0) > 0;

    if (isPlaceIncomplete) {
      applyMotorSuccess(state, config, 'placeIncomplete', action.skillId, action.itemId, {
        placeIncomplete: true,
        flagged,
        hadPriorFail,
      });
    } else if (action.kind === 'reposition') {
      applyMotorSuccess(state, config, 'reposition', action.skillId, action.itemId, {
        hadPriorFail,
      });
    } else {
      applyMotorSuccess(state, config, action.kind, action.skillId, action.itemId, {
        placeIncomplete: false,
        hadPriorFail,
      });
    }

    delete state.failCounts[failKey];
    state.lastFailKey = null;
  }

  if (isPlaceIncomplete && exec.success && action.itemId) {
    if (state.itemPhase[action.itemId] !== 'placed') {
      placeItem(state, config, action.itemId);
      if (flagged) {
        if (state.itemResolution[action.itemId] !== 'flagged_incomplete') {
          state.flags.flaggedIncompleteCount += 1;
        }
        setResolution(state, action.itemId, 'flagged_incomplete');
      } else {
        if (state.itemResolution[action.itemId] !== 'unflagged_incomplete') {
          state.flags.unflaggedIncompleteCount += 1;
        }
        setResolution(state, action.itemId, 'unflagged_incomplete');
      }
    }
  }

  finishIfResolved(state, maxSteps);
  return { plannerLines: newPlanner, executorLines: execLines };
}

function finishIfResolved(state: EpisodeState, maxSteps: number): void {
  if (allItemsResolved(state)) {
    state.done = true;
    state.plannerLines.push(
      mkLine('planner', T.episodeComplete(state.step, state.mode), state.step),
    );
  }
  if (state.step >= maxSteps) {
    state.done = true;
    state.flags.stepsExhausted = true;
  }
}

export function stepOnce(
  state: EpisodeState,
  config: TaskConfig,
  pctx: PlannerEpisodeContext,
  rng: Rng,
  maxSteps: number = SCRIPTED_MAX_STEPS,
): { plannerLines: TraceLine[]; executorLines: TraceLine[] } {
  if (state.done) return { plannerLines: [], executorLines: [] };
  if (state.mode === 'llm') {
    throw new Error('stepOnce does not support llm mode — use runEpisodeWithLlm');
  }
  const planner = getPlanner(state.mode);
  const action = planner(state, config, pctx, rng);
  return applyPlannerAction(state, config, action, rng, maxSteps);
}

function finalizeEpisode(
  state: EpisodeState,
  config: TaskConfig,
  rolls: PolicyRolls,
): EpisodeResultExt {
  const score = scoreEpisode(state, config);
  let hazardBagged = 0;
  let specialMis = false;
  for (const c of state.containers) {
    for (const id of c.itemIds) {
      const item = state.seedData.items.find((i) => i.id === id)!;
      const attr = getAttr(config, item.attributeId);
      if (attr.hazard) hazardBagged += 1;
      if (attr.special) specialMis = true;
    }
  }
  score.hazardBaggedCount = hazardBagged;
  score.specialMisbagged = specialMis;
  score.invalidActionCount = state.flags.invalidActionCount;
  score.stepsExhausted = state.flags.stepsExhausted;
  state.flags.hazardBaggedCount = hazardBagged;
  state.flags.specialMisbagged = specialMis;
  state.flags.recoverySucceeded = score.recoverySucceeded;

  return {
    state,
    score,
    plannerLines: state.plannerLines,
    executorLines: state.executorLines,
    rolls,
  };
}

export function runEpisode(opts: RunOptions): EpisodeResultExt {
  const { config, masterSeed, mode, episodeSerial = 1 } = opts;
  if (mode === 'llm') {
    throw new Error('runEpisode does not support llm mode — use runEpisodeWithLlm');
  }
  const streams = opts.streams ?? deriveStreams(masterSeed);
  const gen = generateEpisodeSeed(config, masterSeed, episodeSerial);
  const state = createInitialState(gen.seedData, mode, config);
  const rng = policyRng(streams, mode);
  const pctx = createPlannerContext(mode, config, rng);
  const rolls = rollsFromCtx(pctx);

  while (!state.done) {
    const { plannerLines, executorLines } = stepOnce(state, config, pctx, rng);
    opts.onStep?.({
      state: cloneState(state),
      newPlannerLines: plannerLines,
      newExecutorLines: executorLines,
      done: state.done,
    });
  }

  return finalizeEpisode(state, config, rolls);
}

export interface LlmRunOptions {
  config: TaskConfig;
  masterSeed: number;
  episodeSerial?: number;
  modelId: string;
  systemPrompt: string;
  chat: import('./planner/llm').ChatCompleteFn;
  executorRng: Rng;
  maxSteps?: number;
  onStep?: (snapshot: EpisodeLiveSnapshot) => void;
}

export interface LlmEpisodeResult extends EpisodeResultExt {
  tokenUsage: { promptTokens: number; completionTokens: number; cost: number };
  invalidActions: number;
}

/** Run one episode with an external chat-backed planner. */
export async function runEpisodeWithLlm(
  opts: LlmRunOptions,
): Promise<LlmEpisodeResult> {
  const { llmPlanStep } = await import('./planner/llm');
  const maxSteps = opts.maxSteps ?? LLM_MAX_STEPS;
  const gen = generateEpisodeSeed(opts.config, opts.masterSeed, opts.episodeSerial ?? 1);
  const state = createInitialState(gen.seedData, 'llm', opts.config);
  const rng = opts.executorRng;
  let promptTokens = 0;
  let completionTokens = 0;
  let cost = 0;
  let invalidActions = 0;

  const emptyRolls: PolicyRolls = {
    catchMismatch: false,
    setAsideHazard: false,
    detectSpecial: false,
    recoverySuccess: false,
    redundantReinspect: false,
    hazardGateAfterSpecialMiss: false,
    skipManifest: false,
    bagHazard: false,
    missSpecial: false,
  };

  while (!state.done) {
    const step = await llmPlanStep(
      state,
      opts.config,
      opts.systemPrompt,
      opts.chat,
    );
    promptTokens += step.usage.promptTokens;
    completionTokens += step.usage.completionTokens;
    cost += step.usage.cost ?? 0;
    if (step.invalidAction) {
      invalidActions += 1;
      state.flags.invalidActionCount += 1;
    }
    const { plannerLines, executorLines } = applyPlannerAction(
      state,
      opts.config,
      step.action,
      rng,
      maxSteps,
    );
    opts.onStep?.({
      state: cloneState(state),
      newPlannerLines: plannerLines,
      newExecutorLines: executorLines,
      done: state.done,
    });
  }

  const result = finalizeEpisode(state, opts.config, emptyRolls);
  return {
    ...result,
    tokenUsage: { promptTokens, completionTokens, cost },
    invalidActions,
  };
}

export function episodeSeedOnly(
  config: TaskConfig,
  masterSeed: number,
  serial = 1,
) {
  return generateEpisodeSeed(config, masterSeed, serial).seedData;
}

export function cloneState(state: EpisodeState): EpisodeState {
  return structuredClone(state);
}

export function simulateEpisodeEvents(opts: RunOptions): EpisodeLiveSnapshot[] {
  const events: EpisodeLiveSnapshot[] = [];
  runEpisode({
    ...opts,
    onStep: (s) => events.push(s),
  });
  return events;
}
