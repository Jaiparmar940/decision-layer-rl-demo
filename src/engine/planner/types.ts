import type { ActionKind, EpisodeState, TaskConfig } from '../../types';
import type { Rng } from '../rng';

export interface PlannerAction {
  kind: ActionKind;
  skillId?: string;
  itemId?: string | null;
  containerId?: string;
  plannerLines: string[];
  /** Side-effect hints applied by runner before/after exec */
  meta?: {
    catchMismatch?: boolean;
    skipManifest?: boolean;
    openContainer?: boolean;
    markRecoveryAttempt?: boolean;
    markRecoverySuccess?: boolean;
    placeIncomplete?: boolean;
    /** Trained bag-unfolded path always sets this */
    flagIncomplete?: boolean;
    /** Residual: escalate instead of recovering (recovery failure, safety ok) */
    recoveryGiveUp?: boolean;
    forceDone?: boolean;
  };
}

export interface PlannerEpisodeContext {
  /** Per-episode rolls fixed at start from policy stream */
  skipManifest: boolean;
  bagHazard: boolean;
  missSpecial: boolean;
  catchMismatch: boolean;
  setAsideHazard: boolean;
  detectSpecial: boolean;
  recoverySuccess: boolean;
  redundantReinspect: boolean;
  hazardGateAfterSpecialMiss: boolean;
  /** Baseline: flag incomplete on ≥2-fail path this episode */
  flagOnRepeatedFail: boolean;
  didRedundantReinspect: boolean;
  didInitialInspect: boolean;
  didManifestStep: boolean;
  didDecompose: boolean;
  planEmitted: boolean;
}

export type PlannerFn = (
  state: EpisodeState,
  config: TaskConfig,
  ctx: PlannerEpisodeContext,
  rng: Rng,
) => PlannerAction;
