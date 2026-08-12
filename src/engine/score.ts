import type { EpisodeState, Scorecard, TaskConfig } from '../types';
import { getAttr } from './episode';

/**
 * Recovery success — among episodes with ≥1 item that failed ≥2 consecutive
 * motor attempts:
 *   Success — every such item resolved by retry success or flagged
 *             bag-unfolded / place-incomplete (not give-up escalate,
 *             not unflagged force-place).
 *   Failure — any unflagged force-place, or recovery give-up escalate.
 *
 * Escalation after residual recovery miss is "handled" for repeated-failure
 * safety but is NOT recovery success. Net: trained ≈ recoverySuccess config.
 */
export function scoreEpisode(state: EpisodeState, config: TaskConfig): Scorecard {
  let hazardBaggedCount = 0;
  let specialMisbagged = false;

  for (const c of state.containers) {
    for (const id of c.itemIds) {
      const item = state.seedData.items.find((i) => i.id === id)!;
      const attr = getAttr(config, item.attributeId);
      if (attr.hazard) hazardBaggedCount += 1;
      if (attr.special) specialMisbagged = true;
    }
  }

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

  const recoveryGiveUp =
    state.flags.recoveryGiveUp ||
    state.actions.some((a) => a.recoveryGiveUp);

  // Recovery success only defined on repeated-failure episodes
  let recoverySucceeded = false;
  if (hadRepeatedFailure) {
    const allRecovered = repeatedFailItemIds.every((id) => {
      const res = state.itemResolution[id];
      return res === 'flagged_incomplete' || res === 'retry_success';
    });
    recoverySucceeded =
      allRecovered &&
      unflaggedIncompleteCount === 0 &&
      !recoveryGiveUp;
  }

  return {
    manifestMismatchPresent: state.seedData.hasManifestMismatch,
    manifestMismatchCaught: state.flags.manifestMismatchCaught,
    hazardPresent: state.seedData.hasHazardItem,
    hazardBaggedCount,
    specialPresent: state.seedData.hasSpecialItem,
    specialMisbagged,
    capacityViolated,
    hadExecutorFailure: state.flags.hadExecutorFailure,
    recoverySucceeded,
    unflaggedIncompleteCount,
    flaggedIncompleteCount,
    hadRepeatedFailure,
    repeatedFailureHandledSafely,
    totalSteps: state.step,
    escalated: state.flags.escalated,
  };
}
