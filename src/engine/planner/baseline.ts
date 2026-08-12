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

export const baselinePlanner: PlannerFn = (
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

  // Manifest
  if (!ctx.didManifestStep) {
    ctx.didManifestStep = true;
    const mctx = {
      label: config.manifest.label,
      claimed: state.seedData.manifestClaimed,
      actual: state.seedData.items.length,
      mismatch: state.seedData.hasManifestMismatch,
      caught: false,
    };
    if (ctx.skipManifest) {
      return wrap({
        kind: 'checkManifest',
        plannerLines: [T.skipManifest(mctx)],
        meta: { skipManifest: true },
      });
    }
    const caught = state.seedData.hasManifestMismatch;
    return wrap({
      kind: 'checkManifest',
      plannerLines: [
        T.manifestCheck({ ...mctx, caught }),
        ...(caught
          ? [T.escalateLine({ reason: 'ticket/manifest discrepancy' })]
          : []),
      ],
      meta: { catchMismatch: caught },
    });
  }

  // One inspect sometimes skipped in baseline — only if not done
  if (!ctx.didInitialInspect) {
    ctx.didInitialInspect = true;
    // Baseline does a shallow inspect only 40% of the time effectively:
    // we still run reInspect but beliefs may stay coarse for specials/hazards
    // when miss rates apply later. Always spend the step for realism sometimes.
    // Spec: baseline skips ticket 60%, not inspect. Do a cheap inspect.
    return wrap({
      kind: 'reInspect',
      plannerLines: [
        T.inspectLine({
          itemCount: state.seedData.items.length,
          revealedHazards: 0,
          revealedSpecial: 0,
        }),
      ],
    });
  }

  // Recovery on last failure: identical retry once
  const last = state.actions[state.actions.length - 1];
  if (last && last.motor && !last.success && last.itemId && last.skillId) {
    const failKey = `${last.skillId}:${last.itemId}`;
    const fails = state.failCounts[failKey] ?? 0;
    const ic = itemCtx(state, config, last.itemId);
    const skillLabel =
      config.skills.find((s) => s.id === last.skillId)?.label ?? last.skillId;

    if (fails === 1 && config.plannerRates.baseline.identicalRetryOnFail > 0) {
      return wrap({
        kind: last.kind,
        skillId: last.skillId,
        itemId: last.itemId,
        plannerLines: [
          T.recoveryDecision({
            itemLabel: ic.itemLabel,
            skillLabel,
            attempt: fails + 1,
            decision: 'retry identical motor primitive',
            priorFailures: fails,
          }),
        ],
        meta: { markRecoveryAttempt: true },
      });
    }

    // Double-fail: force-place incomplete WITHOUT flag (recovery failure)
    if (fails >= 2) {
      const placeSkill = skillIdForRole(config, 'place');
      if (placeSkill && state.itemPhase[last.itemId] !== 'placed') {
        return wrap({
          kind: 'placeIncomplete',
          skillId: placeSkill,
          itemId: last.itemId,
          plannerLines: [
            T.recoveryDecision({
              itemLabel: ic.itemLabel,
              skillLabel,
              attempt: fails,
              decision: 'force place incomplete — no flag',
              priorFailures: fails,
            }),
          ],
          meta: {
            markRecoveryAttempt: true,
            placeIncomplete: true,
            flagIncomplete: false,
          },
        });
      }
    }
  }

  // Capacity: baseline does NOT open second container — will violate
  if (needsCapacitySplit(state, config)) {
    // ignore split; continue placing into overfull bag
  }

  const itemId = nextRawItem(state);
  if (!itemId) {
    return wrap(doneAction(state));
  }

  const trueA = getAttr(config, trueAttr(state, itemId));
  const ic = itemCtx(state, config, itemId);
  const phase = state.itemPhase[itemId]!;

  // Decide set-aside vs bag for hazard/special at start of processing
  if (phase === 'raw') {
    if (trueA.special) {
      if (ctx.missSpecial) {
        // fall through to process as normal
        const lines = [T.missSpecialDecision(ic)];
        const motor = nextMotorForItem(state, config, itemId)!;
        return wrap({ ...motor, plannerLines: [...lines, ...motor.plannerLines] });
      }
      return wrap(setAsideAction(state, config, itemId, 'special property detected'));
    }
    if (trueA.hazard) {
      if (ctx.bagHazard) {
        const lines = [T.bagHazardDecision({ ...ic, mistaken: true })];
        const motor = nextMotorForItem(state, config, itemId)!;
        return wrap({ ...motor, plannerLines: [...lines, ...motor.plannerLines] });
      }
      return wrap(
        setAsideAction(state, config, itemId, 'hazard attribute — do not bag'),
      );
    }
  }

  // If active container full and no split, still try place (capacity violation)
  const c = activeContainer(state);
  if (
    phase !== 'raw' &&
    (phase === 'finished' ||
      (phase === 'picked' && !skillByRole(config, 'prepare') && !skillByRole(config, 'finish')) ||
      (phase === 'prepared' && !skillByRole(config, 'finish'))) &&
    c.itemIds.length >= c.capacity
  ) {
    // will place over capacity
  }

  const motor = nextMotorForItem(state, config, itemId);
  if (!motor) return wrap(doneAction(state));
  return wrap(motor);
};
