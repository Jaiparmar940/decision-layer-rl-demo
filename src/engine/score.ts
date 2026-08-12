import type { EpisodeState, Scorecard, TaskConfig } from '../types';
import { getAttr } from './episode';

export function scoreEpisode(state: EpisodeState, config: TaskConfig): Scorecard {
  let hazardBaggedCount = 0;
  let specialMisbagged = false;

  for (const c of state.containers) {
    if (c.itemIds.length > c.capacity) {
      // already tracked in flags, but recompute hard truth
    }
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

  return {
    manifestMismatchPresent: state.seedData.hasManifestMismatch,
    manifestMismatchCaught: state.flags.manifestMismatchCaught,
    hazardBaggedCount,
    specialPresent: state.seedData.hasSpecialItem,
    specialMisbagged,
    capacityViolated,
    hadExecutorFailure: state.flags.hadExecutorFailure,
    recoverySucceeded: state.flags.recoverySucceeded,
    totalSteps: state.step,
    escalated: state.flags.escalated,
  };
}
