import type { EpisodeState, TaskConfig } from '../../types';
import * as T from '../../copy/traces';
import {
  activeContainer,
  getAttr,
  skillByRole,
  trueAttr,
} from '../episode';
import type { Rng } from '../rng';
import {
  doneAction,
  emitGroundAndPlan,
  itemCtx,
  needsCapacitySplit,
  nextMotorForItem,
  nextRawItem,
  setAsideAction,
  skillIdForRole,
} from './shared';
import type { PlannerAction, PlannerEpisodeContext, PlannerFn } from './types';

export const trainedPlanner: PlannerFn = (
  state: EpisodeState,
  config: TaskConfig,
  ctx: PlannerEpisodeContext,
  _rng: Rng,
): PlannerAction => {
  const prefix = emitGroundAndPlan(state, config, ctx);
  const wrap = (a: PlannerAction): PlannerAction => ({
    ...a,
    plannerLines: [...prefix, ...a.plannerLines],
  });

  // 1. Verify manifest first
  if (!ctx.didManifestStep) {
    ctx.didManifestStep = true;
    const mismatch = state.seedData.hasManifestMismatch;
    const caught = mismatch && ctx.catchMismatch;
    const mctx = {
      label: config.manifest.label,
      claimed: state.seedData.manifestClaimed,
      actual: state.seedData.items.length,
      mismatch,
      caught,
    };
    const lines = [T.manifestCheck(mctx)];
    if (caught) {
      lines.push(T.escalateLine({ reason: 'manifest count discrepancy' }));
    } else if (mismatch && !caught) {
      lines.push(
        T.verifyLine({
          step: state.step + 1,
          action: 'manifest-reconcile',
          success: false,
          note: 'mismatch missed (residual error)',
        }),
      );
    }
    return wrap({
      kind: 'checkManifest',
      plannerLines: lines,
      meta: { catchMismatch: caught },
    });
  }

  // 2. Re-inspect early
  if (!ctx.didInitialInspect) {
    ctx.didInitialInspect = true;
    const hazards = state.seedData.items.filter((it) =>
      getAttr(config, it.attributeId).hazard,
    ).length;
    const specials = state.seedData.items.filter((it) =>
      getAttr(config, it.attributeId).special,
    ).length;
    return wrap({
      kind: 'reInspect',
      plannerLines: [
        T.inspectLine({
          itemCount: state.seedData.items.length,
          revealedHazards: hazards,
          revealedSpecial: specials,
        }),
      ],
    });
  }

  // 15% redundant re-inspect
  if (ctx.redundantReinspect && !ctx.didRedundantReinspect) {
    ctx.didRedundantReinspect = true;
    return wrap({
      kind: 'reInspect',
      plannerLines: [
        T.inspectLine({
          itemCount: state.seedData.items.length,
          revealedHazards: 0,
          revealedSpecial: 0,
          redundant: true,
        }),
      ],
    });
  }

  // Recovery path after executor failure
  const last = state.actions[state.actions.length - 1];
  if (last && last.motor && !last.success && last.itemId && last.skillId) {
    const failKey = `${last.skillId}:${last.itemId}`;
    const fails = state.failCounts[failKey] ?? 0;
    const ic = itemCtx(state, config, last.itemId);
    const skillLabel =
      config.skills.find((s) => s.id === last.skillId)?.label ?? last.skillId;

    // Residual miss (~10% of episodes): escalate+flag rather than recover.
    // Counts as handled-safely but recovery FAILURE for the dashboard metric.
    if (!ctx.recoverySuccess) {
      return wrap({
        kind: 'escalate',
        itemId: last.itemId,
        plannerLines: [
          T.recoveryDecision({
            itemLabel: ic.itemLabel,
            skillLabel,
            attempt: fails,
            decision: 'escalate + flag (recovery residual miss)',
            priorFailures: fails,
          }),
          T.escalateLine({
            reason: 'executor failure — recovery residual',
            itemLabel: ic.itemLabel,
          }),
        ],
        meta: {
          markRecoveryAttempt: true,
          recoveryGiveUp: true,
        },
      });
    }

    if (fails === 1) {
      // reposition once then retry
      return wrap({
        kind: 'reposition',
        skillId: last.skillId,
        itemId: last.itemId,
        plannerLines: [
          T.recoveryDecision({
            itemLabel: ic.itemLabel,
            skillLabel,
            attempt: 2,
            decision: 'reposition once, then retry',
            priorFailures: fails,
          }),
        ],
        meta: { markRecoveryAttempt: true },
      });
    }

    if (fails >= 2) {
      // bag-unfolded + flag — recovery success
      const placeSkill = skillIdForRole(config, 'place')!;
      return wrap({
        kind: 'placeIncomplete',
        skillId: placeSkill,
        itemId: last.itemId,
        plannerLines: [
          T.recoveryDecision({
            itemLabel: ic.itemLabel,
            skillLabel,
            attempt: fails,
            decision: 'bag-unfolded + flag (recovery ok)',
            priorFailures: fails,
          }),
          T.placeIncompleteNote(ic.itemLabel),
        ],
        meta: {
          markRecoveryAttempt: true,
          markRecoverySuccess: true,
          placeIncomplete: true,
          flagIncomplete: true,
        },
      });
    }
  }

  // Capacity split
  if (needsCapacitySplit(state, config)) {
    const c = activeContainer(state);
    return wrap({
      kind: 'openContainer',
      plannerLines: [
        T.capacitySplitLine({
          containerLabel: config.containers.label,
          containerIndex: state.containers.length,
          fill: c.itemIds.length,
          capacity: c.capacity,
        }),
        T.openContainerLine({
          containerLabel: config.containers.label,
          containerIndex: state.containers.length + 1,
          fill: 0,
          capacity: state.seedData.containerCapacity,
        }),
      ],
      meta: { openContainer: true },
    });
  }

  const itemId = nextRawItem(state);
  if (!itemId) {
    return wrap(doneAction(state));
  }

  const trueA = getAttr(config, trueAttr(state, itemId));
  const ic = itemCtx(state, config, itemId);
  const phase = state.itemPhase[itemId]!;

  if (phase === 'raw') {
    if (trueA.special) {
      if (ctx.detectSpecial) {
        return wrap(
          setAsideAction(state, config, itemId, 'special item detected'),
        );
      }
      // residual miss propagates — optional hazard-gate catch uses its own rate (default 0)
      if (trueA.hazard && ctx.hazardGateAfterSpecialMiss) {
        return wrap(
          setAsideAction(
            state,
            config,
            itemId,
            'hazard gate after special miss (config rate)',
          ),
        );
      }
      const motor = nextMotorForItem(state, config, itemId)!;
      return wrap({
        ...motor,
        plannerLines: [
          T.missSpecialDecision(ic),
          ...motor.plannerLines,
        ],
      });
    }

    if (trueA.hazard) {
      if (ctx.setAsideHazard) {
        return wrap(
          setAsideAction(state, config, itemId, 'hazard attribute gated'),
        );
      }
      const motor = nextMotorForItem(state, config, itemId)!;
      return wrap({
        ...motor,
        plannerLines: [
          T.bagHazardDecision({ ...ic, mistaken: true }),
          ...motor.plannerLines,
        ],
      });
    }
  }

  // If about to place and container full but max reached, escalate capacity
  const c = activeContainer(state);
  const aboutToPlace =
    phase === 'finished' ||
    (phase === 'prepared' && !skillByRole(config, 'finish')) ||
    (phase === 'picked' &&
      !skillByRole(config, 'prepare') &&
      !skillByRole(config, 'finish'));
  if (
    aboutToPlace &&
    c.itemIds.length >= c.capacity &&
    state.containers.length >= config.containers.maxContainers
  ) {
    // Park remaining item via set-aside + escalate (no infinite loop)
    const aside = setAsideAction(
      state,
      config,
      itemId,
      `${config.containers.label} capacity exhausted — escalate remainder`,
    );
    return wrap({
      ...aside,
      plannerLines: [
        T.escalateLine({
          reason: `${config.containers.label} capacity exhausted`,
          itemLabel: ic.itemLabel,
        }),
        ...aside.plannerLines,
      ],
    });
  }

  const motor = nextMotorForItem(state, config, itemId);
  if (!motor) return wrap(doneAction(state));
  return wrap(motor);
};
