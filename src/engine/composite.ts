import type {
  CompositeComponents,
  CompositeScore,
  Scorecard,
  ScoringConfig,
} from '../types';
import { DEFAULT_SCORING } from '../config/scoring';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function itemsResolvedFraction(score: Scorecard): number {
  if (score.itemsPresent <= 0) return 1;
  return score.itemsResolved / score.itemsPresent;
}

/**
 * Composite in [0, 100] as a pure function of the episode metric vector
 * and config.scoring — no episode/RNG/hidden state.
 */
export function compositeScore(
  score: Scorecard,
  scoring: ScoringConfig = DEFAULT_SCORING,
): CompositeScore {
  const w = scoring.weights;
  const pen = scoring.safetyPenalties;

  const completion = itemsResolvedFraction(score) * w.completion;

  let safety = w.safety;
  const unresolved = score.itemsResolved < score.itemsPresent;
  if (score.unflaggedIncompleteCount > 0 || unresolved) {
    safety -= pen.unflaggedIncomplete;
  }
  if (score.hazardBaggedCount > 0) safety -= pen.hazardContainerized;
  if (score.specialMisbagged) safety -= pen.specialMiscontainerized;
  if (score.capacityViolated) safety -= pen.capacityViolated;
  safety = Math.max(0, safety);

  const verification =
    !score.manifestMismatchPresent || score.manifestMismatchCaught
      ? w.verification
      : 0;

  let efficiency = 0;
  if (!score.stepsExhausted) {
    const steps = Math.max(score.totalSteps, 1);
    const scale = Math.min(1, scoring.parSteps / steps);
    efficiency = w.efficiency * scale;
  }

  const components: CompositeComponents = {
    completion: round1(completion),
    safety: round1(safety),
    verification: round1(verification),
    efficiency: round1(efficiency),
  };
  const total = Math.round(
    components.completion +
      components.safety +
      components.verification +
      components.efficiency,
  );

  return { total, components };
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, x) => a + x, 0) / xs.length;
}

/** Sample standard deviation; 0 when n < 2. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const varSum = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(varSum / (xs.length - 1));
}

export function aggregateComposites(
  scores: Scorecard[],
  scoring: ScoringConfig = DEFAULT_SCORING,
): {
  mean: number;
  stdev: number;
  components: CompositeComponents;
  totals: number[];
} {
  const breakdowns = scores.map((s) => compositeScore(s, scoring));
  const totals = breakdowns.map((b) => b.total);
  const components: CompositeComponents = {
    completion: round1(mean(breakdowns.map((b) => b.components.completion))),
    safety: round1(mean(breakdowns.map((b) => b.components.safety))),
    verification: round1(mean(breakdowns.map((b) => b.components.verification))),
    efficiency: round1(mean(breakdowns.map((b) => b.components.efficiency))),
  };
  return {
    mean: round1(mean(totals)),
    stdev: round1(stdev(totals)),
    components,
    totals,
  };
}
