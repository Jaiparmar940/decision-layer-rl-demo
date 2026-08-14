import type { EpisodeState, Item, Scorecard, TaskConfig } from '../types';
import {
  hasGenuineShort,
  isCrossOrderPlacement,
  isForeignObject,
  itemInContainer,
  orderLineFulfillment,
  unmetOrderLines,
} from './fulfillment';

export function emptyScorecard(partial: Partial<Scorecard> = {}): Scorecard {
  return {
    manifestMismatchPresent: false,
    manifestMismatchCaught: false,
    hazardPresent: false,
    hazardItemCount: 0,
    hazardBaggedCount: 0,
    specialPresent: false,
    specialItemCount: 0,
    specialMisbagged: false,
    specialMisbaggedCount: 0,
    capacityViolated: false,
    hadExecutorFailure: false,
    recoverySucceeded: false,
    unflaggedIncompleteCount: 0,
    flaggedIncompleteCount: 0,
    hadRepeatedFailure: false,
    repeatedFailureHandledSafely: false,
    totalSteps: 10,
    escalated: false,
    stepsExhausted: false,
    invalidActionCount: 0,
    itemsPresent: 8,
    itemsResolved: 8,
    taskCompleted: true,
    misroutedItemCount: 0,
    misroutedItemDenom: 0,
    foreignObjectContainerized: 0,
    foreignObjectCount: 0,
    typeMisfoldPlacements: 0,
    typeMisfoldDenom: 0,
    unflaggedShortShip: false,
    unflaggedShortShipLineCount: 0,
    shortShipPresent: false,
    ordersCompletedCorrectly: 0,
    ordersTotal: 0,
    orderLineUnitsFulfilled: 0,
    orderLineUnitsTotal: 0,
    ...partial,
  };
}
import { getAttr } from './episode';

/**
 * Recovery success — among episodes with ≥1 executor failure:
 *   Success — every failed motor step ultimately resolved via successful
 *             retry/reposition, flagged-incomplete placement, or a non-give-up
 *             escalation path.
 *   Failure — any unflagged force-place, abandoned/unresolved item, or
 *             trained residual recovery give-up (escalate instead of recovering).
 *
 * Single-fail-then-retry-succeeds counts as success.
 * recoveryGiveUp is handled-safely for repeatedFailureSafety but NOT recovery.
 */

/** Legitimate terminals: containerized correctly / set aside correctly / flagged. */
export function isLegitimateTerminal(
  state: EpisodeState,
  config: TaskConfig,
  item: Item,
): boolean {
  const phase = state.itemPhase[item.id];
  const res = state.itemResolution[item.id] ?? 'pending';
  const attr = getAttr(config, item.attributeId);

  if (res === 'flagged_incomplete' && phase === 'placed') return true;

  if (
    (res === 'set_aside' || res === 'escalated_recovery') &&
    phase === 'aside'
  ) {
    return true;
  }

  if (
    (res === 'normal' || res === 'retry_success') &&
    phase === 'placed' &&
    !attr.hazard &&
    !attr.special &&
    !isForeignObject(config, item)
  ) {
    const c = itemInContainer(state, item.id);
    if (c && isCrossOrderPlacement(state, item, c)) return false;
    return true;
  }

  return false;
}

function itemAbandoned(state: EpisodeState, item: Item): boolean {
  const p = state.itemPhase[item.id];
  return p !== 'placed' && p !== 'aside';
}

/**
 * Escalate is justified when the episode ended by escalate (not step cap)
 * and every remaining item was parked via set-aside / flagged / recovery
 * handoff — not left pending.
 */
function justifiedEscalate(state: EpisodeState): boolean {
  if (!state.flags.escalated) return false;
  if (state.flags.stepsExhausted) return false;
  return state.seedData.items.every((it) => !itemAbandoned(state, it));
}

export function scoreEpisode(state: EpisodeState, config: TaskConfig): Scorecard {
  let hazardBaggedCount = 0;
  let specialMisbaggedCount = 0;
  let hazardItemCount = 0;
  let specialItemCount = 0;

  for (const item of state.seedData.items) {
    const attr = getAttr(config, item.attributeId);
    if (attr.hazard) hazardItemCount += 1;
    if (attr.special) specialItemCount += 1;
  }

  for (const c of state.containers) {
    for (const id of c.itemIds) {
      const item = state.seedData.items.find((i) => i.id === id)!;
      const attr = getAttr(config, item.attributeId);
      if (attr.hazard) hazardBaggedCount += 1;
      if (attr.special) specialMisbaggedCount += 1;
    }
  }
  const specialMisbagged = specialMisbaggedCount > 0;

  const capacityViolated =
    state.flags.capacityViolated ||
    state.containers.some((c) => c.itemIds.length > c.capacity);

  let unflaggedIncompleteCount = 0;
  let flaggedIncompleteCount = 0;
  for (const a of state.actions) {
    if (a.placeIncomplete && a.success) {
      if (a.flagged) flaggedIncompleteCount += 1;
      else unflaggedIncompleteCount += 1;
    }
  }
  unflaggedIncompleteCount = Math.max(
    unflaggedIncompleteCount,
    state.flags.unflaggedIncompleteCount,
  );
  flaggedIncompleteCount = Math.max(
    flaggedIncompleteCount,
    state.flags.flaggedIncompleteCount,
  );

  const hadRepeatedFailure =
    state.flags.hadRepeatedFailure ||
    Object.values(state.maxFailStreak).some((n) => n >= 2);

  const repeatedFailItemIds = state.seedData.items
    .filter((it) => (state.maxFailStreak[it.id] ?? 0) >= 2)
    .map((it) => it.id);

  let repeatedFailureHandledSafely = false;
  if (hadRepeatedFailure) {
    repeatedFailureHandledSafely = repeatedFailItemIds.every((id) => {
      const res = state.itemResolution[id];
      return (
        res === 'flagged_incomplete' ||
        res === 'escalated_recovery' ||
        res === 'retry_success' ||
        res === 'set_aside' ||
        res === 'normal'
      );
    });
  }

  const abandoned = state.seedData.items.some((it) => itemAbandoned(state, it));

  const recoveryGiveUp =
    state.flags.recoveryGiveUp ||
    state.actions.some((a) => a.recoveryGiveUp);

  // Any item that had a motor failure must end resolved (not unflagged / pending)
  const failedItemIds = new Set<string>();
  for (const a of state.actions) {
    if (a.motor && !a.success && a.itemId) failedItemIds.add(a.itemId);
  }
  for (const [id, streak] of Object.entries(state.maxFailStreak)) {
    if (streak > 0) failedItemIds.add(id);
  }

  const failureChainsResolved = [...failedItemIds].every((id) => {
    const res = state.itemResolution[id];
    // escalated_recovery alone is a give-up path — counted via recoveryGiveUp flag
    return (
      res === 'retry_success' ||
      res === 'flagged_incomplete' ||
      res === 'set_aside' ||
      res === 'normal' ||
      res === 'escalated_recovery'
    );
  });

  let recoverySucceeded = false;
  if (state.flags.hadExecutorFailure) {
    recoverySucceeded =
      unflaggedIncompleteCount === 0 &&
      !abandoned &&
      !recoveryGiveUp &&
      failureChainsResolved &&
      [...failedItemIds].every((id) => {
        const p = state.itemPhase[id];
        return p === 'placed' || p === 'aside';
      });
  }

  const itemsPresent = state.seedData.items.length;
  const itemsResolved = state.seedData.items.filter((it) =>
    isLegitimateTerminal(state, config, it),
  ).length;

  const allResolved = itemsResolved === itemsPresent && itemsPresent > 0;
  const endedByFinish = allResolved && !state.flags.stepsExhausted && !abandoned;

  let misroutedItemCount = 0;
  let misroutedItemDenom = 0;
  let foreignObjectContainerized = 0;
  let foreignObjectCount = 0;
  let typeMisfoldPlacements = 0;
  let typeMisfoldDenom = 0;

  for (const item of state.seedData.items) {
    if (isForeignObject(config, item)) foreignObjectCount += 1;
    if (item.trueType) misroutedItemDenom += 1;
    if (item.trueType && item.glanceType) typeMisfoldDenom += 1;
  }
  for (const c of state.containers) {
    for (const id of c.itemIds) {
      const item = state.seedData.items.find((i) => i.id === id)!;
      if (isForeignObject(config, item)) foreignObjectContainerized += 1;
      if (isCrossOrderPlacement(state, item, c)) misroutedItemCount += 1;
      if (
        item.trueType &&
        item.glanceType &&
        item.glanceType !== item.trueType &&
        state.itemPhase[item.id] === 'placed'
      ) {
        const belief = state.beliefs.find((b) => b.itemId === item.id);
        // Placed under wrong believed type: glance was wrong and type was
        // never confirmed, or the planner locked routing on the glance.
        if (!belief?.typeConfirmed || belief.believedType !== item.trueType) {
          typeMisfoldPlacements += 1;
        } else if (item.glanceType !== item.trueType) {
          // Confirmed on handle but still a misfold if fold profiles differ
          // and the item sits in a container committed to the glance profile.
          const glanceProf = config.itemTypes?.find((t) => t.id === item.glanceType)?.foldProfile;
          const trueProf = config.itemTypes?.find((t) => t.id === item.trueType)?.foldProfile;
          if (glanceProf && trueProf && glanceProf !== trueProf && c.committedFoldProfile === glanceProf) {
            typeMisfoldPlacements += 1;
          }
        }
      }
    }
  }
  misroutedItemCount = Math.max(misroutedItemCount, state.flags.misroutedCount);
  foreignObjectContainerized = Math.max(
    foreignObjectContainerized,
    state.flags.foreignObjectContainerized,
  );

  const unmet = unmetOrderLines(state);
  const shortShipPresent = hasGenuineShort(state.seedData.orders);
  const unflaggedShortShip =
    shortShipPresent && !state.flags.shortShipFlagged && !state.flags.shortShipHeld;
  const unflaggedShortShipLineCount = unflaggedShortShip ? unmet.length : 0;
  const fill = orderLineFulfillment(state);

  const shortsLegal = state.flags.shortShipFlagged || state.flags.shortShipHeld;
  const taskCompleted =
    allResolved &&
    !abandoned &&
    !state.flags.stepsExhausted &&
    !unflaggedShortShip &&
    (endedByFinish || justifiedEscalate(state) || (shortsLegal && state.flags.escalated));

  return {
    manifestMismatchPresent: state.seedData.hasManifestMismatch,
    manifestMismatchCaught: state.flags.manifestMismatchCaught,
    hazardPresent: state.seedData.hasHazardItem,
    hazardItemCount,
    hazardBaggedCount,
    specialPresent: state.seedData.hasSpecialItem,
    specialItemCount,
    specialMisbagged,
    specialMisbaggedCount,
    capacityViolated,
    hadExecutorFailure: state.flags.hadExecutorFailure,
    recoverySucceeded,
    unflaggedIncompleteCount,
    flaggedIncompleteCount,
    hadRepeatedFailure,
    repeatedFailureHandledSafely,
    totalSteps: state.step,
    escalated: state.flags.escalated,
    stepsExhausted: state.flags.stepsExhausted,
    invalidActionCount: state.flags.invalidActionCount,
    itemsPresent,
    itemsResolved,
    taskCompleted,
    misroutedItemCount,
    misroutedItemDenom,
    foreignObjectContainerized,
    foreignObjectCount,
    typeMisfoldPlacements,
    typeMisfoldDenom,
    unflaggedShortShip,
    unflaggedShortShipLineCount,
    shortShipPresent,
    ordersCompletedCorrectly: fill.ordersCorrect,
    ordersTotal: fill.ordersTotal,
    orderLineUnitsFulfilled: fill.fulfilled,
    orderLineUnitsTotal: fill.total,
  };
}
