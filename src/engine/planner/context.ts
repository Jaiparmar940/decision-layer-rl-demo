import type { PolicyMode, TaskConfig } from '../../types';
import { chance, type Rng } from '../rng';
import type { PlannerEpisodeContext } from './types';

export function createPlannerContext(
  mode: PolicyMode,
  config: TaskConfig,
  rng: Rng,
): PlannerEpisodeContext {
  const b = config.plannerRates.baseline;
  const t = config.plannerRates.trained;

  if (mode === 'baseline') {
    return {
      skipManifest: chance(rng, b.skipManifestVerify),
      bagHazard: chance(rng, b.bagHazardItem),
      missSpecial: chance(rng, b.missSpecialItem),
      catchMismatch: false,
      setAsideHazard: false,
      detectSpecial: false,
      recoverySuccess: false,
      redundantReinspect: false,
      hazardGateAfterSpecialMiss: false,
      flagOnRepeatedFail: chance(rng, b.flagOnRepeatedFail ?? 0),
      didRedundantReinspect: false,
      didInitialInspect: false,
      didManifestStep: false,
      didDecompose: false,
      planEmitted: false,
    };
  }

  return {
    skipManifest: false,
    bagHazard: false,
    missSpecial: false,
    catchMismatch: chance(rng, t.catchManifestMismatch),
    setAsideHazard: chance(rng, t.setAsideHazard),
    detectSpecial: chance(rng, t.detectSpecialItem),
    recoverySuccess: chance(rng, t.recoverySuccess),
    redundantReinspect: chance(rng, t.redundantReinspectEpisode),
    hazardGateAfterSpecialMiss: chance(
      rng,
      t.hazardGateAfterSpecialMiss ?? 0,
    ),
    flagOnRepeatedFail: false,
    didRedundantReinspect: false,
    didInitialInspect: false,
    didManifestStep: false,
    didDecompose: false,
    planEmitted: false,
  };
}
