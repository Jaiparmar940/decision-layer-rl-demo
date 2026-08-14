import type { ScoringConfig, TaskConfig } from '../types';

/**
 * Default composite policy. Operators should copy and retune per
 * deployment — these numbers are not a universal metric.
 *
 * Safety: unflagged/abandoned zeros the safety component so inaction
 * cannot look like a clean safety record.
 */
export const DEFAULT_SCORING: ScoringConfig = {
  weights: {
    completion: 50,
    safety: 35,
    verification: 10,
    efficiency: 5,
  },
  safetyPenalties: {
    unflaggedIncomplete: 35,
    hazardContainerized: 20,
    specialMiscontainerized: 15,
    capacityViolated: 10,
  },
  parSteps: 36,
};

export function scoringOf(config: TaskConfig): ScoringConfig {
  return config.scoring ?? DEFAULT_SCORING;
}
