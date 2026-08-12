import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import { runBatch, runResultsBatch } from './batch';
import { formatMetric } from './metrics';

describe('RESULTS batch determinism', () => {
  it('two RESULTS computations for hospitality produce identical aggregates', () => {
    const a = runResultsBatch(hospitalityConfig);
    const b = runResultsBatch(hospitalityConfig);

    expect(a.episodeCount).toBe(1000);
    expect(b.episodeCount).toBe(1000);

    expect(formatMetric(a.baseline.recoverySuccess)).toBe(
      formatMetric(b.baseline.recoverySuccess),
    );
    expect(formatMetric(a.trained.recoverySuccess)).toBe(
      formatMetric(b.trained.recoverySuccess),
    );
    expect(formatMetric(a.baseline.unflaggedIncomplete)).toBe(
      formatMetric(b.baseline.unflaggedIncomplete),
    );
    expect(formatMetric(a.trained.unflaggedIncomplete)).toBe(
      formatMetric(b.trained.unflaggedIncomplete),
    );
    expect(formatMetric(a.baseline.repeatedFailureSafety)).toBe(
      formatMetric(b.baseline.repeatedFailureSafety),
    );
    expect(a.baseline.meanSteps).toBe(b.baseline.meanSteps);
    expect(a.trained.meanSteps).toBe(b.trained.meanSteps);
    expect(a.baselineScores.length).toBe(1000);
    expect(a.trainedScores.length).toBe(1000);
  }, 120_000);

  it('matches runBatch with the same count and seed sequence', () => {
    const detailed = runResultsBatch(foldingConfig);
    const plain = runBatch(foldingConfig, 1000);

    expect(formatMetric(detailed.baseline.recoverySuccess)).toBe(
      formatMetric(plain.baseline.recoverySuccess),
    );
    expect(formatMetric(detailed.trained.specialMisbagged)).toBe(
      formatMetric(plain.trained.specialMisbagged),
    );
    expect(detailed.baseline.meanSteps).toBe(plain.baseline.meanSteps);
  }, 120_000);
});
