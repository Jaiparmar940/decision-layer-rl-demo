import type { ActionKind, EpisodeState, TaskConfig } from '../../types';
import type { Rng } from '../rng';

export interface PlannerAction {
  kind: ActionKind;
  skillId?: string;
  itemId?: string | null;
  containerId?: string;
  /** Target order when opening an additional dedicated container. */
  orderId?: string;
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
    /** Legal short-ship ending: escalate/flag with unmet line count. */
    flagShortShip?: boolean;
    /** Legal short-ship ending: hold rather than finish. */
    holdShort?: boolean;
    /** Glance/routing type the planner treated this place as. */
    placedAsType?: string;
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
  /**
   * Destination container locked from glance (baseline) or after type
   * confirm (trained). Config-driven; unused when the domain has no orders.
   */
  intendedContainerByItem: Record<string, string>;
}

export type PlannerFn = (
  state: EpisodeState,
  config: TaskConfig,
  ctx: PlannerEpisodeContext,
  rng: Rng,
) => PlannerAction;
