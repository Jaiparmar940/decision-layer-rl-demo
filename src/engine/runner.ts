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
  arrivalObsLines,
  createInitialState,
  generateEpisodeSeed,
  getAttr,
  maybeAdmitBatch,
  skillByRole,
  trueAttr,
} from './episode';
import {
  foldProfile,
  isCrossOrderPlacement,
  isForeignObject,
  qualityGateOn,
  typeLabel,
  unmetOrderLines,
} from './fulfillment';
import { executeAction } from './executor';
import { createPlannerContext, getPlanner } from './planner';
import type { PlannerAction, PlannerEpisodeContext } from './planner/types';
import { deriveStreams, type Rng, type StreamBundle } from './rng';
import { scoreEpisode } from './score';
import {
  transcriptEndedBy,
  type EpisodeTranscript,
  type TranscriptStep,
} from './transcript';

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
  const visible = new Set(state.visibleItemIds);
  for (const it of state.seedData.items) {
    if (!visible.has(it.id)) continue;
    const b = state.beliefs.find((x) => x.itemId === it.id)!;
    b.inspected = true;
    b.attributeId = it.attributeId;
    // Glance type is NOT corrected by global reInspect — only by handle.
  }
}

function confirmTypeOnHandle(state: EpisodeState, itemId: string): string | null {
  const item = state.seedData.items.find((i) => i.id === itemId);
  if (!item?.trueType) return null;
  const b = state.beliefs.find((x) => x.itemId === itemId);
  if (!b) return null;
  const was = b.believedType;
  b.believedType = item.trueType;
  b.typeConfirmed = true;
  return was !== item.trueType ? item.trueType : null;
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

interface PlaceResult {
  ok: boolean;
  observation?: string;
}

function placeItem(
  state: EpisodeState,
  config: TaskConfig,
  itemId: string,
  containerId?: string,
  opts?: { bypassQualityGate?: boolean; placedAsType?: string },
): PlaceResult {
  const c =
    (containerId
      ? state.containers.find((x) => x.id === containerId)
      : undefined) ?? activeContainer(state);
  const item = state.seedData.items.find((i) => i.id === itemId)!;
  const profile = foldProfile(config, item.trueType);

  if (
    qualityGateOn(config) &&
    !opts?.bypassQualityGate &&
    profile &&
    c.committedFoldProfile &&
    c.committedFoldProfile !== profile
  ) {
    return {
      ok: false,
      observation: T.obsQualityGateReject({
        itemLabel: item.label,
        itemProfile: profile,
        committedProfile: c.committedFoldProfile,
        containerLabel: c.label ?? c.id,
      }),
    };
  }

  if (c.itemIds.length >= c.capacity) {
    state.flags.capacityViolated = true;
  }
  if (!c.itemIds.includes(itemId)) {
    c.itemIds.push(itemId);
  }
  if (profile && !c.committedFoldProfile) {
    c.committedFoldProfile = profile;
  }
  state.itemPhase[itemId] = 'placed';
  state.heldItemId = null;
  state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);

  const attr = getAttr(config, trueAttr(state, itemId));
  if (attr.hazard) state.flags.hazardBaggedCount += 1;
  if (attr.special) state.flags.specialMisbagged = true;
  if (isForeignObject(config, item)) state.flags.foreignObjectContainerized += 1;
  if (isCrossOrderPlacement(state, item, c)) state.flags.misroutedCount += 1;

  const believed = state.beliefs.find((b) => b.itemId === itemId);
  const usedType = opts?.placedAsType ?? believed?.believedType ?? item.glanceType;
  if (item.trueType && usedType && usedType !== item.trueType) {
    state.flags.typeMisfoldCount += 1;
  }

  return { ok: true };
}

function appendArrival(state: EpisodeState, config: TaskConfig, itemIds: string[], step?: number): void {
  if (!itemIds.length) return;
  for (const text of arrivalObsLines(state, config, itemIds)) {
    state.executorLines.push(mkLine('executor', text, step));
  }
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
    containerId?: string;
    placedAsType?: string;
  },
): { typeConfirmObs?: string; placeRejected?: string } {
  if (!itemId) return {};

  const isSetAside =
    kind === 'setAside' || skillByRole(config, 'setAside')?.id === skillId;
  if (isSetAside) {
    state.itemPhase[itemId] = 'aside';
    if (!state.setAsideIds.includes(itemId)) state.setAsideIds.push(itemId);
    state.heldItemId = null;
    state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);
    setResolution(state, itemId, 'set_aside');
    return {};
  }

  if (kind === 'pick' || skillByRole(config, 'pick')?.id === skillId) {
    state.itemPhase[itemId] = 'picked';
    state.heldItemId = itemId;
    const confirmed = confirmTypeOnHandle(state, itemId);
    if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
    if (confirmed) {
      const item = state.seedData.items.find((i) => i.id === itemId);
      return {
        typeConfirmObs: T.obsTypeConfirmed({
          itemLabel: item?.label ?? itemId,
          typeLabel: typeLabel(config, confirmed),
        }),
      };
    }
    return {};
  }

  if (kind === 'prepare' || skillByRole(config, 'prepare')?.id === skillId) {
    state.itemPhase[itemId] = 'prepared';
    const confirmed = confirmTypeOnHandle(state, itemId);
    if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
    if (confirmed) {
      const item = state.seedData.items.find((i) => i.id === itemId);
      return {
        typeConfirmObs: T.obsTypeConfirmed({
          itemLabel: item?.label ?? itemId,
          typeLabel: typeLabel(config, confirmed),
        }),
      };
    }
    return {};
  }

  if (kind === 'finish' || skillByRole(config, 'finish')?.id === skillId) {
    state.itemPhase[itemId] = 'finished';
    if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
    return {};
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
        const confirmed = confirmTypeOnHandle(state, itemId);
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        if (confirmed) {
          const item = state.seedData.items.find((i) => i.id === itemId);
          return {
            typeConfirmObs: T.obsTypeConfirmed({
              itemLabel: item?.label ?? itemId,
              typeLabel: typeLabel(config, confirmed),
            }),
          };
        }
        return {};
      }
      if (skill?.role === 'prepare') {
        state.itemPhase[itemId] = 'prepared';
        const confirmed = confirmTypeOnHandle(state, itemId);
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        if (confirmed) {
          const item = state.seedData.items.find((i) => i.id === itemId);
          return {
            typeConfirmObs: T.obsTypeConfirmed({
              itemLabel: item?.label ?? itemId,
              typeLabel: typeLabel(config, confirmed),
            }),
          };
        }
        return {};
      }
      if (skill?.role === 'finish') {
        state.itemPhase[itemId] = 'finished';
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        return {};
      }
      if (skill?.role === 'setAside') {
        state.itemPhase[itemId] = 'aside';
        if (!state.setAsideIds.includes(itemId)) state.setAsideIds.push(itemId);
        state.pendingItemQueue = state.pendingItemQueue.filter((id) => id !== itemId);
        setResolution(state, itemId, 'set_aside');
        return {};
      }
      if (skill?.role === 'place') {
        const placed = placeItem(state, config, itemId, opts?.containerId, {
          bypassQualityGate: Boolean(opts?.placeIncomplete),
          placedAsType: opts?.placedAsType,
        });
        if (!placed.ok) return { placeRejected: placed.observation };
        if (opts?.hadPriorFail) setResolution(state, itemId, 'retry_success');
        else if (state.itemResolution[itemId] === 'pending') {
          setResolution(state, itemId, 'normal');
        }
        return {};
      }
    }

    if (opts?.placeIncomplete || kind === 'place' || kind === 'placeIncomplete') {
      const placed = placeItem(state, config, itemId, opts?.containerId, {
        bypassQualityGate: Boolean(opts?.placeIncomplete),
        placedAsType: opts?.placedAsType,
      });
      if (!placed.ok) return { placeRejected: placed.observation };
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
  return {};
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

  if (action.meta?.flagShortShip || action.meta?.holdShort) {
    state.step += 1;
    state.flags.escalated = true;
    if (action.meta.flagShortShip) state.flags.shortShipFlagged = true;
    if (action.meta.holdShort) state.flags.shortShipHeld = true;
    const unmet = unmetOrderLines(state);
    const execLines = [
      mkLine(
        'executor',
        T.shortShipLine({
          lines: unmet.map((l) => ({
            orderLabel: l.orderLabel,
            typeId: l.typeId,
            missing: l.missing,
          })),
          flagged: Boolean(action.meta.flagShortShip),
          held: Boolean(action.meta.holdShort),
        }),
        state.step,
      ),
    ];
    state.executorLines.push(...execLines);
    state.actions.push({
      step: state.step,
      kind: 'escalate',
      success: true,
      motor: false,
      flagged: Boolean(action.meta.flagShortShip),
    });
    state.done = true;
    return { plannerLines: newPlanner, executorLines: execLines };
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
    const admitted = maybeAdmitBatch(state, config);
    if (admitted.length) {
      const before = state.executorLines.length;
      appendArrival(state, config, admitted, state.step);
      execLines.push(...state.executorLines.slice(before));
    }
    finishIfResolved(state, maxSteps);
    return { plannerLines: newPlanner, executorLines: execLines };
  }

  if (action.kind === 'openContainer' || action.meta?.openContainer) {
    state.step += 1;
    if (state.containers.length < config.containers.maxContainers) {
      const orderId =
        action.orderId ??
        state.containers[state.containers.length - 1]?.orderId;
      state.containers.push({
        id: `c${state.containers.length}`,
        capacity: state.seedData.containerCapacity,
        itemIds: [],
        orderId,
        label: orderId
          ? `${orderId} ${config.containers.label}`
          : undefined,
        committedFoldProfile: null,
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
    const visible = state.visibleItemIds.length;
    const inbound = state.inboundQueue.length;
    const actual = state.seedData.items.length;
    const mismatch = claimed !== actual;
    const inboundNote = state.seedData.streamEnabled
      ? ` inbound-remaining=${inbound}`
      : '';
    const orderNote =
      state.seedData.orders.length > 0
        ? ' · ' +
          state.seedData.orders
            .map(
              (o) =>
                `${o.label} ` +
                o.lines.map((l) => `${l.typeId}×${l.count}`).join(','),
            )
            .join(' · ')
        : '';
    exec = {
      success: true,
      motor: false,
      observation: `${config.manifest.label}: claimed=${claimed} visible=${visible}${inboundNote}${mismatch ? ' MISMATCH' : ' OK'}${orderNote}`,
      executorLines: [
        T.nonMotorExec(`check ${config.manifest.label}`),
        `OBS: claimed ${claimed}, visible pile ${visible}${inboundNote}${mismatch ? ' — mismatch' : ''}${orderNote}`,
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
    containerId: action.containerId,
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
    const motorOpts = {
      flagged,
      hadPriorFail,
      containerId: action.containerId,
      placedAsType: action.meta?.placedAsType,
    };

    const extra = isPlaceIncomplete
      ? applyMotorSuccess(state, config, 'placeIncomplete', action.skillId, action.itemId, {
          ...motorOpts,
          placeIncomplete: true,
        })
      : action.kind === 'reposition'
        ? applyMotorSuccess(state, config, 'reposition', action.skillId, action.itemId, motorOpts)
        : applyMotorSuccess(state, config, action.kind, action.skillId, action.itemId, {
            ...motorOpts,
            placeIncomplete: false,
          });

    if (extra.typeConfirmObs) {
      const line = mkLine('executor', extra.typeConfirmObs, state.step);
      state.executorLines.push(line);
      execLines.push(line);
    }

    if (extra.placeRejected) {
      record.success = false;
      record.observation = extra.placeRejected;
      const line = mkLine('executor', extra.placeRejected, state.step);
      state.executorLines.push(line);
      execLines.push(line);
      state.flags.hadExecutorFailure = true;
      const streak = (state.failCounts[failKey] ?? 0) + 1;
      state.failCounts[failKey] = streak;
      state.lastFailKey = failKey;
      if (action.itemId) noteFailStreak(state, action.itemId, streak);
    } else {
      delete state.failCounts[failKey];
      state.lastFailKey = null;
    }
  }

  if (isPlaceIncomplete && exec.success && record.success && action.itemId) {
    if (state.itemPhase[action.itemId] !== 'placed') {
      placeItem(state, config, action.itemId, action.containerId, {
        bypassQualityGate: true,
        placedAsType: action.meta?.placedAsType,
      });
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

  const admitted = maybeAdmitBatch(state, config);
  if (admitted.length) {
    const before = state.executorLines.length;
    appendArrival(state, config, admitted, state.step);
    execLines.push(...state.executorLines.slice(before));
  }

  finishIfResolved(state, maxSteps);
  return { plannerLines: newPlanner, executorLines: execLines };
}

function finishIfResolved(state: EpisodeState, maxSteps: number): void {
  const unmet = unmetOrderLines(state);
  const inboundLeft = state.inboundQueue.length > 0;
  // With orders, don't auto-complete when lines are unmet — planner must
  // flag-short / hold (legal) or forceDone (unflagged short = violation).
  if (allItemsResolved(state) && !inboundLeft && unmet.length === 0) {
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
  onPlannerStep?: (info: import('./planner/parseAction').PlannerStepInfo) => void;
  throwIfAborted?: () => void;
}

export interface LlmEpisodeResult extends EpisodeResultExt {
  tokenUsage: import('./planner/llm').ChatCompletionUsage;
  invalidActions: number;
  invalidRecords: import('./planner/parseAction').InvalidActionRecord[];
  transcript: EpisodeTranscript;
}

/** Run one episode with an external chat-backed planner. */
export async function runEpisodeWithLlm(
  opts: LlmRunOptions,
): Promise<LlmEpisodeResult> {
  const { llmPlanStep, formatPlannerUserMessage, serializePlannerView } =
    await import('./planner/llm');
  const maxSteps = opts.maxSteps ?? LLM_MAX_STEPS;
  const gen = generateEpisodeSeed(opts.config, opts.masterSeed, opts.episodeSerial ?? 1);
  const state = createInitialState(gen.seedData, 'llm', opts.config);
  const rng = opts.executorRng;
  const { addUsage, emptyUsage } = await import('./planner/usage');
  let tokenUsage = emptyUsage();
  let invalidActions = 0;
  const invalidRecords: import('./planner/parseAction').InvalidActionRecord[] =
    [];
  const transcriptSteps: TranscriptStep[] = [];

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
    opts.throwIfAborted?.();
    const payloadText = formatPlannerUserMessage(state, opts.config);
    const payload = serializePlannerView(state, opts.config);
    const index = state.actions.length;
    const step = await llmPlanStep(
      state,
      opts.config,
      opts.systemPrompt,
      opts.chat,
    );
    tokenUsage = addUsage(tokenUsage, step.usage);
    if (step.invalidAction) {
      invalidActions += 1;
      state.flags.invalidActionCount += 1;
      if (step.invalidRecord) invalidRecords.push(step.invalidRecord);
    }
    opts.onPlannerStep?.({
      extractionPath: step.extractionPath,
      invalid: step.invalidAction,
      invalidRecord: step.invalidRecord,
    });
    const actionsBefore = state.actions.length;
    const execBefore = state.executorLines.length;
    const { plannerLines, executorLines } = applyPlannerAction(
      state,
      opts.config,
      step.action,
      rng,
      maxSteps,
    );
    const record = state.actions[state.actions.length - 1] ?? null;
    const newExec = state.executorLines.slice(execBefore).map((l) => l.text);
    transcriptSteps.push({
      index,
      payloadText,
      payload,
      action: step.draft,
      validationError: step.validationError,
      applied: state.actions.length > actionsBefore,
      rawResponses: step.rawResponses,
      extractionPath: step.extractionPath,
      invalidFailure: step.invalidRecord ?? undefined,
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
    });
    opts.onStep?.({
      state: cloneState(state),
      newPlannerLines: plannerLines,
      newExecutorLines: executorLines,
      done: state.done,
    });
  }

  const result = finalizeEpisode(state, opts.config, emptyRolls);
  const transcript: EpisodeTranscript = {
    schemaVersion: 1,
    source: 'llm',
    episodeId: state.seedData.episodeId,
    masterSeed: opts.masterSeed,
    domain: opts.config.meta.id,
    domainLabel: opts.config.meta.domainLabel,
    maxSteps,
    modelId: opts.modelId,
    steps: transcriptSteps,
    scorecard: result.score,
    endedBy: transcriptEndedBy(result.score, state.done),
  };
  return {
    ...result,
    tokenUsage,
    invalidActions,
    invalidRecords,
    transcript,
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
