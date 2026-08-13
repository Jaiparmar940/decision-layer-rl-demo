import type { EpisodeState, Item, TaskConfig } from '../../types';
import * as T from '../../copy/traces';
import { activeContainer, generateEpisodeSeed, getAttr, trueAttr } from '../episode';
import { formatEpisodeId } from '../rng';
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

/** Frozen pile so baseline vs trained is the same episode before vs after training. */
export const DEMO_LIVE_SEED = 4242;

const DEMO_ATTRS = [
  'normal',
  'damp',
  'hotelLogo',
  'normal',
  'stained',
  'normal',
  'hotelLogo',
  'normal',
  'damp',
  'normal',
] as const;

export function pinDemoEpisode(config: TaskConfig, serial: number) {
  const demoConfig: TaskConfig = {
    ...config,
    itemCountMin: DEMO_ATTRS.length,
    itemCountMax: DEMO_ATTRS.length,
    specialItemEpisodeRate: 1,
    manifest: { ...config.manifest, discrepancyMin: 1, discrepancyMax: 1 },
  };
  const gen = generateEpisodeSeed(demoConfig, DEMO_LIVE_SEED, 1);
  const fallback =
    config.itemAttributes.find((a) => a.normal)?.id ?? config.itemAttributes[0]!.id;
  gen.seedData.items = DEMO_ATTRS.map((attrId, i) => {
    const existing = gen.seedData.items[i];
    const id = existing?.id ?? `item-${i + 1}`;
    return {
      id,
      index: i + 1,
      attributeId: config.itemAttributes.some((a) => a.id === attrId) ? attrId : fallback,
      label: `${config.ui.itemLabel}-${String(i + 1).padStart(2, '0')}`,
    };
  });
  gen.seedData.containerCapacity = 4;
  gen.seedData.manifestClaimed = gen.seedData.items.length - 1;
  gen.seedData.hasManifestMismatch = true;
  gen.seedData.hasHazardItem = gen.seedData.items.some((it) =>
    getAttr(config, it.attributeId).hazard,
  );
  gen.seedData.hasSpecialItem = gen.seedData.items.some((it) =>
    getAttr(config, it.attributeId).special,
  );
  gen.seedData.episodeId = formatEpisodeId(serial);
  gen.seedData.masterSeed = DEMO_LIVE_SEED;
  return gen;
}

function focusItem(state: EpisodeState, config: TaskConfig): Item {
  return (
    state.seedData.items.find((it) => getAttr(config, it.attributeId).normal) ??
    state.seedData.items[0]!
  );
}

function withSuccess(action: PlannerAction): PlannerAction {
  return {
    ...action,
    meta: { ...action.meta, forceSuccess: true },
  };
}

function pickFail(
  itemId: string,
  pickId: string,
  pickFails: number,
  lines: string[],
): PlannerAction {
  return {
    kind: 'pick',
    skillId: pickId,
    itemId,
    plannerLines: lines,
    meta: { forceFail: true, markRecoveryAttempt: pickFails > 0 },
  };
}

/**
 * Full-depth live script for the demo-video branch.
 * Same 10-garment pile both times (original hospitality range). Baseline
 * skips the ticket, fails pick twice on the first clean garment, force-places
 * it unflagged, then bags hazards, misses specials, and overfills. Trained
 * verifies first, set-asides exceptions, repositions + flags the same miss,
 * and splits the bag when full.
 */
export const demoLivePlanner: PlannerFn = (state, config, ctx) => {
  const prefix = emitGroundAndPlan(state, config, ctx);
  const wrap = (a: PlannerAction): PlannerAction => ({
    ...a,
    plannerLines: [...prefix, ...a.plannerLines],
  });

  if (state.mode === 'baseline') {
    return wrap(baselineScript(state, config, ctx));
  }
  return wrap(trainedScript(state, config, ctx));
};

function baselineScript(
  state: EpisodeState,
  config: TaskConfig,
  ctx: PlannerEpisodeContext,
): PlannerAction {
  const focus = focusItem(state, config);
  const pickId = skillIdForRole(config, 'pick') ?? 'pick';
  const placeId = skillIdForRole(config, 'place') ?? 'bag';
  const pickLabel =
    config.skills.find((s) => s.id === pickId)?.label ?? 'pick';
  const ic = itemCtx(state, config, focus.id);
  const pickFails = state.failCounts[`${pickId}:${focus.id}`] ?? 0;
  const focusPhase = state.itemPhase[focus.id];
  const focusOpen = focusPhase !== 'placed' && focusPhase !== 'aside';

  if (!ctx.didManifestStep) {
    ctx.didManifestStep = true;
    return {
      kind: 'checkManifest',
      plannerLines: [
        T.skipManifest({
          label: config.manifest.label,
          claimed: state.seedData.manifestClaimed,
          actual: state.seedData.items.length,
          mismatch: state.seedData.hasManifestMismatch,
          caught: false,
        }),
      ],
      meta: { skipManifest: true },
    };
  }

  if (!ctx.didInitialInspect) {
    ctx.didInitialInspect = true;
    return {
      kind: 'reInspect',
      plannerLines: [
        T.inspectLine({
          itemCount: state.seedData.items.length,
          revealedHazards: 0,
          revealedSpecial: 0,
        }),
      ],
    };
  }

  if (focusOpen) {
    if (pickFails < 2 && focusPhase === 'raw') {
      const retry = pickFails > 0;
      return pickFail(
        focus.id,
        pickId,
        pickFails,
        retry
          ? [
              T.recoveryDecision({
                itemLabel: ic.itemLabel,
                skillLabel: pickLabel,
                attempt: pickFails + 1,
                decision: 'retry identical pick — no reposition',
                priorFailures: pickFails,
              }),
            ]
          : [T.processItemLine(ic)],
      );
    }
    if (focusPhase === 'raw' || pickFails >= 2) {
      return {
        kind: 'placeIncomplete',
        skillId: placeId,
        itemId: focus.id,
        plannerLines: [
          T.recoveryDecision({
            itemLabel: ic.itemLabel,
            skillLabel: pickLabel,
            attempt: pickFails,
            decision: 'force place incomplete — no flag',
            priorFailures: pickFails,
          }),
        ],
        meta: {
          placeIncomplete: true,
          flagIncomplete: false,
          markRecoveryAttempt: true,
        },
      };
    }
  }

  const itemId = nextRawItem(state);
  if (!itemId) return doneAction(state);

  const attr = getAttr(config, trueAttr(state, itemId));
  const motor = nextMotorForItem(state, config, itemId);
  if (!motor) return doneAction(state);

  if (attr.special) {
    return withSuccess({
      ...motor,
      plannerLines: [T.missSpecialDecision(itemCtx(state, config, itemId)), ...motor.plannerLines],
    });
  }
  if (attr.hazard) {
    return withSuccess({
      ...motor,
      plannerLines: [
        T.bagHazardDecision({ ...itemCtx(state, config, itemId), mistaken: true }),
        ...motor.plannerLines,
      ],
    });
  }
  return withSuccess(motor);
}

function trainedScript(
  state: EpisodeState,
  config: TaskConfig,
  ctx: PlannerEpisodeContext,
): PlannerAction {
  const focus = focusItem(state, config);
  const pickId = skillIdForRole(config, 'pick') ?? 'pick';
  const placeId = skillIdForRole(config, 'place') ?? 'bag';
  const pickLabel =
    config.skills.find((s) => s.id === pickId)?.label ?? 'pick';
  const ic = itemCtx(state, config, focus.id);
  const pickFails = state.failCounts[`${pickId}:${focus.id}`] ?? 0;
  const focusPhase = state.itemPhase[focus.id];
  const focusOpen = focusPhase !== 'placed' && focusPhase !== 'aside';
  const didReposition = state.actions.some(
    (a) => a.kind === 'reposition' && a.itemId === focus.id,
  );

  if (!ctx.didManifestStep) {
    ctx.didManifestStep = true;
    const mismatch = state.seedData.hasManifestMismatch;
    return {
      kind: 'checkManifest',
      plannerLines: [
        T.manifestCheck({
          label: config.manifest.label,
          claimed: state.seedData.manifestClaimed,
          actual: state.seedData.items.length,
          mismatch,
          caught: mismatch,
        }),
        ...(mismatch
          ? [T.escalateLine({ reason: 'ticket/manifest discrepancy' })]
          : []),
      ],
      meta: { catchMismatch: mismatch },
    };
  }

  if (!ctx.didInitialInspect) {
    ctx.didInitialInspect = true;
    const hazards = state.seedData.items.filter((it) =>
      getAttr(config, it.attributeId).hazard,
    ).length;
    const specials = state.seedData.items.filter((it) =>
      getAttr(config, it.attributeId).special,
    ).length;
    return {
      kind: 'reInspect',
      plannerLines: [
        T.inspectLine({
          itemCount: state.seedData.items.length,
          revealedHazards: hazards,
          revealedSpecial: specials,
        }),
      ],
    };
  }

  if (needsCapacitySplit(state, config)) {
    const c = activeContainer(state);
    return {
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
    };
  }

  if (focusOpen) {
    if (pickFails === 0 && focusPhase === 'raw') {
      return pickFail(focus.id, pickId, 0, [T.processItemLine(ic)]);
    }
    if (pickFails === 1 && !didReposition) {
      return {
        kind: 'reposition',
        skillId: pickId,
        itemId: focus.id,
        plannerLines: [
          T.recoveryDecision({
            itemLabel: ic.itemLabel,
            skillLabel: pickLabel,
            attempt: 2,
            decision: 'reposition, then retry pick',
            priorFailures: 1,
          }),
        ],
        meta: { holdPhase: true, markRecoveryAttempt: true },
      };
    }
    if (pickFails === 1 && didReposition && focusPhase === 'raw') {
      return pickFail(focus.id, pickId, 1, [
        T.recoveryDecision({
          itemLabel: ic.itemLabel,
          skillLabel: pickLabel,
          attempt: 2,
          decision: 'retry pick after reposition',
          priorFailures: 1,
        }),
      ]);
    }
    if (pickFails >= 2) {
      return {
        kind: 'placeIncomplete',
        skillId: placeId,
        itemId: focus.id,
        plannerLines: [
          T.recoveryDecision({
            itemLabel: ic.itemLabel,
            skillLabel: pickLabel,
            attempt: pickFails,
            decision: 'could not finish — flag incomplete (do not hide)',
            priorFailures: pickFails,
          }),
          T.placeIncompleteNote(ic.itemLabel),
        ],
        meta: {
          placeIncomplete: true,
          flagIncomplete: true,
          markRecoveryAttempt: true,
          markRecoverySuccess: true,
        },
      };
    }
  }

  const itemId = nextRawItem(state);
  if (!itemId) return doneAction(state);

  const attr = getAttr(config, trueAttr(state, itemId));
  if (attr.hazard) {
    return withSuccess(
      setAsideAction(state, config, itemId, 'hazard attribute gated'),
    );
  }
  if (attr.special) {
    return withSuccess(
      setAsideAction(state, config, itemId, 'special item detected'),
    );
  }

  const motor = nextMotorForItem(state, config, itemId);
  if (!motor) return doneAction(state);
  return withSuccess(motor);
}
