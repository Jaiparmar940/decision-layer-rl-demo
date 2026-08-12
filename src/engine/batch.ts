import type { BatchResult, Scorecard, TaskConfig } from '../types';
import { buildBatchResult } from './metrics';
import { runEpisode } from './runner';

export function runBatch(config: TaskConfig, count?: number): BatchResult {
  const n = count ?? config.batch.episodes;
  const baselineScores: Scorecard[] = [];
  const trainedScores: Scorecard[] = [];

  const t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  for (let i = 0; i < n; i++) {
    const masterSeed = 1000 + i * 97 + ((i * 13) % 89);
    const serial = i + 1;

    const b = runEpisode({
      config,
      masterSeed,
      mode: 'baseline',
      episodeSerial: serial,
    });
    baselineScores.push(b.score);

    const t = runEpisode({
      config,
      masterSeed,
      mode: 'trained',
      episodeSerial: serial,
    });
    trainedScores.push(t.score);
  }

  const t1 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  return buildBatchResult(baselineScores, trainedScores, t1 - t0, config);
}

/**
 * Empirical residual rates from policy rolls (not outcome proxies),
 * so tests compare against config.plannerRates.trained directly.
 */
export function measureTrainedResiduals(config: TaskConfig, n: number) {
  let catchN = 0;
  let catchD = 0;
  let asideN = 0;
  let asideD = 0;
  let detectN = 0;
  let detectD = 0;
  let recoveryN = 0;
  let recoveryD = 0;
  let redundantN = 0;

  for (let i = 0; i < n; i++) {
    const masterSeed = 5000 + i * 41;
    const result = runEpisode({
      config,
      masterSeed,
      mode: 'trained',
      episodeSerial: i + 1,
    });
    const { rolls, score, state } = result;

    if (state.seedData.hasManifestMismatch) {
      catchD += 1;
      if (rolls.catchMismatch) catchN += 1;
    }

    // Hazard set-aside roll is an episode-level policy rate
    if (state.seedData.hasHazardItem) {
      asideD += 1;
      if (rolls.setAsideHazard) asideN += 1;
    }

    if (state.seedData.hasSpecialItem) {
      detectD += 1;
      if (rolls.detectSpecial) detectN += 1;
    }

    // Recovery residual only meaningful when ≥1 executor failure occurred
    if (score.hadExecutorFailure) {
      recoveryD += 1;
      if (rolls.recoverySuccess) recoveryN += 1;
    }

    if (rolls.redundantReinspect) redundantN += 1;
  }

  return {
    catchManifestMismatch: catchD === 0 ? null : catchN / catchD,
    setAsideHazard: asideD === 0 ? null : asideN / asideD,
    detectSpecial: detectD === 0 ? null : detectN / detectD,
    recoverySuccess: recoveryD === 0 ? null : recoveryN / recoveryD,
    redundantReinspectEpisode: redundantN / n,
    denominators: {
      catchD,
      asideD,
      detectD,
      recoveryD,
    },
  };
}
