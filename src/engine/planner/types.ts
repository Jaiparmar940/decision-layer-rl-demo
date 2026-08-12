import type { ActionKind, EpisodeState, TaskConfig } from '../../types';
import type { Rng } from '../rng';

export interface PlannerAction {
  kind: ActionKind;
  skillId?: string;
  itemId?: string | null;
  plannerLines: string[];
  /** Side-effect hints applied by runner before/after exec */
  meta?: {
    catchMismatch?: boolean;
    skipManifest?: boolean;
    openContainer?: boolean;
    markRecoveryAttempt?: boolean;
    markRecoverySuccess?: boolean;
    placeIncomplete?: boolean;
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
