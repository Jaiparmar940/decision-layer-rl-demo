import type {
  BatchResult,
  MetricValue,
  PolicyMetrics,
  PolicyMode,
  Scorecard,
  TaskConfig,
} from '../types';

function metric(
  numerator: number,
  denominator: number,
  label: string,
  denomLabel: string,
): MetricValue {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
    label,
    denomLabel,
  };
}

export function formatMetric(m: MetricValue): string {
  if (m.denominator === 0) {
    return `${m.label}: n/a (0 episodes)`;
  }
  const pct = Math.round((m.rate ?? 0) * 100);
  return `${m.label}: ${m.numerator}/${m.denominator} ${m.denomLabel} (${pct}%)`;
}

export interface EpisodeScoreRow {
  mode: PolicyMode;
  score: Scorecard;
}

export function aggregateScores(
  mode: PolicyMode,
  scores: Scorecard[],
): PolicyMetrics {
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

  const repeatedEps = scores.filter((s) => s.hadRepeatedFailure);
  // Recovery denom = repeated-failure episodes (where residual path applies)
  const recoveryOk = repeatedEps.filter((s) => s.recoverySucceeded).length;
  const repeatedSafe = repeatedEps.filter(
    (s) => s.repeatedFailureHandledSafely,
  ).length;

  const escalated = scores.filter((s) => s.escalated).length;
  const meanSteps =
    n === 0 ? 0 : scores.reduce((a, s) => a + s.totalSteps, 0) / n;

  return {
    mode,
    episodes: n,
    manifestMismatchCaught: metric(
      mismatchCaught,
      mismatchEps.length,
      'Ticket/manifest mismatch caught',
      'episodes with a mismatch',
    ),
    hazardBaggedEpisodes: metric(
      hazardBaggedEps,
      hazardPresentEps.length,
      'Episodes with hazard item containerized',
      'episodes containing ≥1 hazard item',
    ),
    specialMisbagged: metric(
      specialMis,
      specialEps.length,
      'Special/house item mis-containerized',
      'episodes containing special item',
    ),
    capacityViolated: metric(capViol, n, 'Capacity violated', 'episodes'),
    recoverySuccess: metric(
      recoveryOk,
      repeatedEps.length,
      'Recovery success',
      'episodes with ≥1 item failing ≥2 consecutive motor attempts',
    ),
    unflaggedIncomplete: metric(
      unflaggedEps,
      n,
      'Incomplete item containerized without flag',
      'episodes',
    ),
    repeatedFailureSafety: metric(
      repeatedSafe,
      repeatedEps.length,
      'Repeated-failure episodes handled safely',
      'episodes with ≥1 item failing ≥2 consecutive motor attempts',
    ),
    meanSteps,
    escalateRate: metric(escalated, n, 'Escalated', 'episodes'),
  };
}

export function buildBatchResult(
  baselineScores: Scorecard[],
  trainedScores: Scorecard[],
  wallMs: number,
  config: TaskConfig,
): BatchResult {
  const episodeCount =
    config.batch?.episodes ?? Math.max(baselineScores.length, trainedScores.length);
  const totalRuns = baselineScores.length + trainedScores.length;
  const episodesPerSec = wallMs > 0 ? (totalRuns / wallMs) * 1000 : 0;

  return {
    baseline: aggregateScores('baseline', baselineScores),
    trained: aggregateScores('trained', trainedScores),
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
  } as TaskConfig);
}
