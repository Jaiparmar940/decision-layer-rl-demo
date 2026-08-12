import type {
  ActionRecord,
  EpisodeResult,
  EpisodeState,
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
import type { PlannerEpisodeContext } from './planner/types';
import { deriveStreams, type Rng, type StreamBundle } from './rng';
import { scoreEpisode } from './score';

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

/** Exposed on result for residual-rate tests */
export interface PolicyRolls {
  catchMismatch: boolean;
  setAsideHazard: boolean;
  detectSpecial: boolean;
  recoverySuccess: boolean;
  redundantReinspect: boolean;
  skipManifest: boolean;
  bagHazard: boolean;
  missSpecial: boolean;
}

export interface EpisodeResultExt extends EpisodeResult {
  rolls: PolicyRolls;
}

function policyRng(streams: StreamBundle, mode: PolicyMode): Rng {
  return mode === 'baseline'
    ? streams.streamExecutorBaseline
    : streams.streamExecutorTrained;
}

function rollsFromCtx(ctx: PlannerEpisodeContext): PolicyRolls {
  return {
    catchMismatch: ctx.catchMismatch,
    setAsideHazard: ctx.setAsideHazard,
    detectSpecial: ctx.detectSpecial,
    recoverySuccess: ctx.recoverySuccess,
    redundantReinspect: ctx.redundantReinspect,
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
  if (attr.hazard) {
    // recount at score time; keep running flag
    state.flags.hazardBaggedCount += 1;
  }
  if (attr.special) state.flags.specialMisbagged = true;
}

function applyMotorSuccess(
  state: EpisodeState,
  config: TaskConfig,
  kind: string,
  skillId: string | undefined,
  itemId: string | null | undefined,
  opts?: { placeIncomplete?: boolean },
): void {
  if (!itemId) return;

  const isSetAside =
    kind === 'setAside' || skillByRole(config, 'setAside')?.id === skillId;
  if (isSetAside) {
    state.itemPhase[itemId] = 'aside';
    if (!state.setAsideIds.includes(itemId)) state.setAsideIds.push(itemId);
    state.heldItemId = null;
    state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);
    return;
  }

  if (kind === 'pick' || skillByRole(config, 'pick')?.id === skillId) {
    state.itemPhase[itemId] = 'picked';
    state.heldItemId = itemId;
    return;
  }

  if (kind === 'prepare' || skillByRole(config, 'prepare')?.id === skillId) {
    state.itemPhase[itemId] = 'prepared';
    return;
  }

  if (kind === 'finish' || skillByRole(config, 'finish')?.id === skillId) {
    state.itemPhase[itemId] = 'finished';
    return;
  }

  if (
    kind === 'place' ||
    kind === 'placeIncomplete' ||
    kind === 'reposition' ||
    skillByRole(config, 'place')?.id === skillId ||
    opts?.placeIncomplete
  ) {
    // reposition retries the failed skill — map by skill role
    if (kind === 'reposition' && skillId) {
      const skill = config.skills.find((s) => s.id === skillId);
      if (skill?.role === 'pick') {
        state.itemPhase[itemId] = 'picked';
        state.heldItemId = itemId;
        return;
      }
      if (skill?.role === 'prepare') {
        state.itemPhase[itemId] = 'prepared';
        return;
      }
      if (skill?.role === 'finish') {
        state.itemPhase[itemId] = 'finished';
        return;
      }
      if (skill?.role === 'place' || skill?.role === 'setAside') {
        if (skill.role === 'setAside') {
          state.itemPhase[itemId] = 'aside';
          if (!state.setAsideIds.includes(itemId)) state.setAsideIds.push(itemId);
          state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);
          return;
        }
        placeItem(state, config, itemId);
        return;
      }
    }

    if (opts?.placeIncomplete || kind === 'place' || kind === 'placeIncomplete') {
      placeItem(state, config, itemId);
    }
  }
}

function allItemsResolved(state: EpisodeState): boolean {
  return state.seedData.items.every((it) => {
    const p = state.itemPhase[it.id];
    return p === 'placed' || p === 'aside';
  });
}

export function stepOnce(
  state: EpisodeState,
  config: TaskConfig,
  pctx: PlannerEpisodeContext,
  rng: Rng,
): { plannerLines: TraceLine[]; executorLines: TraceLine[] } {
  if (state.done) return { plannerLines: [], executorLines: [] };

  const planner = getPlanner(state.mode);
  const action = planner(state, config, pctx, rng);

  const newPlanner = action.plannerLines.map((t) =>
    mkLine('planner', t, state.step + 1),
  );
  state.plannerLines.push(...newPlanner);

  if (action.meta?.forceDone) {
    state.done = true;
    return { plannerLines: newPlanner, executorLines: [] };
  }

  // Recovery residual miss: escalate, park item, no loop
  if (
    action.kind === 'escalate' &&
    action.itemId &&
    action.meta?.markRecoveryAttempt &&
    !action.meta.markRecoverySuccess
  ) {
    state.step += 1;
    state.flags.escalated = true;
    state.flags.recoveryAttempted = true;
    const execLines = [
      mkLine('executor', T.nonMotorExec('escalate-to-staff'), state.step),
    ];
    state.executorLines.push(...execLines);
    if (state.itemPhase[action.itemId] !== 'placed') {
      state.itemPhase[action.itemId] = 'aside';
      if (!state.setAsideIds.includes(action.itemId)) {
        state.setAsideIds.push(action.itemId);
      }
      state.pendingItemQueue = state.pendingItemQueue.filter(
        (id) => id !== action.itemId,
      );
    }
    state.lastFailKey = null;
    // clear fail counts for item
    for (const k of Object.keys(state.failCounts)) {
      if (k.endsWith(`:${action.itemId}`)) delete state.failCounts[k];
    }
    if (allItemsResolved(state)) {
      state.done = true;
      state.plannerLines.push(
        mkLine('planner', T.episodeComplete(state.step, state.mode), state.step),
      );
    }
    return { plannerLines: newPlanner, executorLines: execLines };
  }

  if (action.meta?.openContainer) {
    state.step += 1;
    state.containers.push({
      id: `c${state.containers.length}`,
      capacity: state.seedData.containerCapacity,
      itemIds: [],
    });
    state.flags.openedSecondContainer = true;
    const execLines = [
      mkLine(
        'executor',
        T.nonMotorExec(`open ${config.containers.label}`),
        state.step,
      ),
    ];
    state.executorLines.push(...execLines);
    return { plannerLines: newPlanner, executorLines: execLines };
  }

  // placeIncomplete / reposition still go through executor
  const execKind =
    action.kind === 'placeIncomplete'
      ? 'place'
      : action.kind === 'reposition'
        ? action.kind
        : action.kind;

  const exec = executeAction(
    state,
    config,
    {
      kind: execKind,
      skillId: action.skillId,
      itemId: action.itemId,
    },
    rng,
  );

  state.step += 1;
  const execLines = exec.executorLines.map((t) =>
    mkLine('executor', t, state.step),
  );
  state.executorLines.push(...execLines);

  const record: ActionRecord = {
    step: state.step,
    kind: action.kind,
    skillId: action.skillId,
    itemId: action.itemId,
    success: exec.success,
    motor: exec.motor,
    observation: exec.observation,
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
    state.failCounts[failKey] = (state.failCounts[failKey] ?? 0) + 1;
    state.lastFailKey = failKey;
  } else if (exec.motor && exec.success) {
    const failKey = `${action.skillId}:${action.itemId ?? 'none'}`;
    const hadPriorFail = (state.failCounts[failKey] ?? 0) > 0;

    if (action.meta?.placeIncomplete) {
      applyMotorSuccess(state, config, 'placeIncomplete', action.skillId, action.itemId, {
        placeIncomplete: true,
      });
      if (action.meta.markRecoverySuccess) {
        state.flags.recoverySucceeded = true;
      }
    } else if (action.kind === 'reposition') {
      applyMotorSuccess(state, config, 'reposition', action.skillId, action.itemId);
      if (hadPriorFail) state.flags.recoverySucceeded = true;
    } else {
      applyMotorSuccess(state, config, action.kind, action.skillId, action.itemId, {
        placeIncomplete: action.meta?.placeIncomplete,
      });
      if (hadPriorFail && action.meta?.markRecoveryAttempt) {
        state.flags.recoverySucceeded = true;
      }
    }

    delete state.failCounts[failKey];
    state.lastFailKey = null;
  }

  // placeIncomplete that is non-motor? shouldn't happen
  if (action.meta?.placeIncomplete && exec.success && action.itemId) {
    if (state.itemPhase[action.itemId] !== 'placed') {
      placeItem(state, config, action.itemId);
    }
    if (action.meta.markRecoverySuccess) {
      state.flags.recoverySucceeded = true;
    }
  }

  if (allItemsResolved(state)) {
    state.done = true;
    state.plannerLines.push(
      mkLine('planner', T.episodeComplete(state.step, state.mode), state.step),
    );
  }

  if (state.step > 200) {
    state.done = true;
  }

  return { plannerLines: newPlanner, executorLines: execLines };
}

export function runEpisode(opts: RunOptions): EpisodeResultExt {
  const { config, masterSeed, mode, episodeSerial = 1 } = opts;
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

  const score = scoreEpisode(state, config);
  // Fix hazard count from final bags (avoid double-count from retries)
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
  state.flags.hazardBaggedCount = hazardBagged;
  state.flags.specialMisbagged = specialMis;

  return {
    state,
    score,
    plannerLines: state.plannerLines,
    executorLines: state.executorLines,
    rolls,
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
