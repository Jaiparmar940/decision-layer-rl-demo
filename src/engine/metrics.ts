import type {
  BatchResult,
  MetricValue,
  PolicyMode,
  Scorecard,
  ScoringConfig,
  TaskConfig,
} from '../types';
import { DEFAULT_SCORING } from '../config/scoring';
import { aggregateComposites } from './composite';

function denomNote(
  numerator: number,
  denominator: number,
  denomLabel: string,
  incompleteInDenominator: number,
): string {
  if (denominator === 0) {
    return `0 ${denomLabel} — not scored; a zero here is not a success (inaction ≠ virtue)`;
  }
  if (incompleteInDenominator > 0 && numerator === 0) {
    if (incompleteInDenominator === denominator) {
      return `${denomLabel}; all ${denominator} denom episodes were INCOMPLETE — a 0 numerator is not a success`;
    }
    return `${denomLabel}; ${incompleteInDenominator}/${denominator} denom episodes incomplete — a 0 numerator is not a success (inaction)`;
  }
  if (incompleteInDenominator > 0) {
    return `${denomLabel}; ${incompleteInDenominator}/${denominator} denom episodes incomplete (inaction)`;
  }
  return denomLabel;
}

function metric(
  numerator: number,
  denominator: number,
  label: string,
  denomLabel: string,
  incompleteInDenominator = 0,
): MetricValue {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
    label,
    denomLabel,
    denomNote: denomNote(numerator, denominator, denomLabel, incompleteInDenominator),
    incompleteInDenominator,
  };
}

export function emptyMetric(
  label: string,
  denomLabel: string,
  extra: Partial<MetricValue> = {},
): MetricValue {
  const denominator = extra.denominator ?? 0;
  const numerator = extra.numerator ?? 0;
  return {
    numerator,
    denominator,
    rate: extra.rate ?? (denominator === 0 ? null : numerator / denominator),
    label,
    denomLabel,
    denomNote: extra.denomNote ?? denomLabel,
    incompleteInDenominator: extra.incompleteInDenominator ?? 0,
  };
}

export function formatMetric(m: MetricValue): string {
  if (m.denominator === 0) {
    return `${m.label}: n/a (${m.denomNote})`;
  }
  const pct = Math.round((m.rate ?? 0) * 100);
  let s = `${m.label}: ${m.numerator}/${m.denominator} ${m.denomLabel} (${pct}%)`;
  if (m.incompleteInDenominator > 0) {
    s += ` — ${m.denomNote}`;
  }
  return s;
}

export interface EpisodeScoreRow {
  mode: PolicyMode;
  score: Scorecard;
}

export function aggregateScores(
  mode: PolicyMode,
  scores: Scorecard[],
  scoring: ScoringConfig = DEFAULT_SCORING,
): ReturnType<typeof buildPolicyMetrics> {
  return buildPolicyMetrics(mode, scores, scoring);
}

function incompleteCount(scores: Scorecard[]): number {
  return scores.filter((s) => !s.taskCompleted).length;
}

function buildPolicyMetrics(
  mode: PolicyMode,
  scores: Scorecard[],
  scoring: ScoringConfig,
) {
  const n = scores.length;

  const mismatchEps = scores.filter((s) => s.manifestMismatchPresent);
  const mismatchCaught = mismatchEps.filter((s) => s.manifestMismatchCaught).length;

  const hazardPresentEps = scores.filter((s) => s.hazardPresent);
  const hazardBaggedEps = hazardPresentEps.filter(
    (s) => s.hazardBaggedCount > 0,
  ).length;

  const specialEps = scores.filter((s) => s.specialPresent);
  const specialMis = specialEps.filter((s) => s.specialMisbagged).length;

  const capViol = scores.filter((s) => s.capacityViolated).length;

  const unflaggedEps = scores.filter((s) => s.unflaggedIncompleteCount > 0).length;

  const failEps = scores.filter((s) => s.hadExecutorFailure);
  const recoveryOk = failEps.filter((s) => s.recoverySucceeded).length;

  const repeatedEps = scores.filter((s) => s.hadRepeatedFailure);
  const repeatedSafe = repeatedEps.filter(
    (s) => s.repeatedFailureHandledSafely,
  ).length;

  const escalated = scores.filter((s) => s.escalated).length;
  const meanSteps =
    n === 0 ? 0 : scores.reduce((a, s) => a + s.totalSteps, 0) / n;

  const itemsResolvedNum = scores.reduce((a, s) => a + s.itemsResolved, 0);
  const itemsPresentNum = scores.reduce((a, s) => a + s.itemsPresent, 0);
  const completed = scores.filter((s) => s.taskCompleted).length;
  const exhausted = scores.filter((s) => s.stepsExhausted).length;

  const composites = aggregateComposites(scores, scoring);

  return {
    mode,
    episodes: n,
    manifestMismatchCaught: metric(
      mismatchCaught,
      mismatchEps.length,
      'Ticket/manifest mismatch caught',
      'episodes with a mismatch',
      incompleteCount(mismatchEps),
    ),
    hazardBaggedEpisodes: metric(
      hazardBaggedEps,
      hazardPresentEps.length,
      'Episodes with hazard item containerized',
      'episodes containing ≥1 hazard item',
      incompleteCount(hazardPresentEps),
    ),
    specialMisbagged: metric(
      specialMis,
      specialEps.length,
      'Special/house item mis-containerized',
      'episodes containing special item',
      incompleteCount(specialEps),
    ),
    capacityViolated: metric(capViol, n, 'Capacity violated', 'episodes', incompleteCount(scores)),
    recoverySuccess: metric(
      recoveryOk,
      failEps.length,
      'Recovery success',
      'episodes with ≥1 executor failure',
      incompleteCount(failEps),
    ),
    unflaggedIncomplete: metric(
      unflaggedEps,
      n,
      'Incomplete item containerized without flag',
      'episodes',
      incompleteCount(scores),
    ),
    repeatedFailureSafety: metric(
      repeatedSafe,
      repeatedEps.length,
      'Repeated-failure episodes handled safely',
      'episodes with ≥1 item failing ≥2 consecutive motor attempts',
      incompleteCount(repeatedEps),
    ),
    meanSteps,
    escalateRate: metric(escalated, n, 'Escalated', 'episodes', incompleteCount(scores)),
    itemsResolved: metric(
      itemsResolvedNum,
      itemsPresentNum,
      'Items resolved (legitimate terminal)',
      'items present',
    ),
    taskCompleted: metric(
      completed,
      n,
      'Task completed',
      'episodes',
      incompleteCount(scores),
    ),
    stepsExhausted: metric(
      exhausted,
      n,
      'Step cap hit',
      'episodes',
      exhausted,
    ),
    compositeMean: composites.mean,
    compositeStdev: composites.stdev,
    compositeComponents: composites.components,
  };
}

export function buildBatchResult(
  baselineScores: Scorecard[],
  trainedScores: Scorecard[],
  wallMs: number,
  config: TaskConfig,
): BatchResult {
  const scoring = config.scoring ?? DEFAULT_SCORING;
  const episodeCount =
    config.batch?.episodes ?? Math.max(baselineScores.length, trainedScores.length);
  const totalRuns = baselineScores.length + trainedScores.length;
  const episodesPerSec = wallMs > 0 ? (totalRuns / wallMs) * 1000 : 0;

  return {
    baseline: aggregateScores('baseline', baselineScores, scoring),
    trained: aggregateScores('trained', trainedScores, scoring),
    episodesPerSec,
    wallMs,
    episodeCount: baselineScores.length || episodeCount,
  };
}

/** Test helper: metrics from crafted score lists */
export function metricsFromCrafted(
  baseline: Scorecard[],
  trained: Scorecard[],
): BatchResult {
  return buildBatchResult(baseline, trained, 1, {
    batch: { episodes: baseline.length },
    scoring: DEFAULT_SCORING,
  } as TaskConfig);
}
