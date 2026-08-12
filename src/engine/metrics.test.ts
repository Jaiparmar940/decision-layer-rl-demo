import { describe, expect, it } from 'vitest';
import type { Scorecard } from '../types';
import { aggregateScores, formatMetric, metricsFromCrafted } from './metrics';

function sc(partial: Partial<Scorecard>): Scorecard {
  return {
    manifestMismatchPresent: false,
    manifestMismatchCaught: false,
    hazardPresent: false,
    hazardBaggedCount: 0,
    specialPresent: false,
    specialMisbagged: false,
    capacityViolated: false,
    hadExecutorFailure: false,
    recoverySucceeded: false,
    unflaggedIncompleteCount: 0,
    flaggedIncompleteCount: 0,
    hadRepeatedFailure: false,
    repeatedFailureHandledSafely: false,
    totalSteps: 10,
    escalated: false,
    ...partial,
  };
}

describe('dashboard denominators', () => {
  it('uses conditional denominators on a crafted set', () => {
    // 10 episodes: 4 with mismatch (3 caught), 3 with executor fail (2 recovered)
    // 5 with hazard present (1 bagged), 2 special (1 misbagged)
    // 3 unflagged incomplete, 4 repeated-fail (2 safe)
    const scores: Scorecard[] = [
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: true,
        hadExecutorFailure: true,
        recoverySucceeded: true,
        hazardPresent: true,
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: true,
      }),
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: true,
        hadExecutorFailure: true,
        recoverySucceeded: true,
        hazardPresent: true,
        unflaggedIncompleteCount: 1,
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: false,
      }),
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: true,
        hadExecutorFailure: true,
        recoverySucceeded: false,
        hazardPresent: true,
        hazardBaggedCount: 2,
        unflaggedIncompleteCount: 2,
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: false,
      }),
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: false,
        hazardPresent: true,
      }),
      sc({ capacityViolated: true, unflaggedIncompleteCount: 1 }),
      sc({}),
      sc({ specialPresent: true, specialMisbagged: true }),
      sc({ specialPresent: true, specialMisbagged: false }),
      sc({ hazardPresent: true }),
      sc({
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: true,
      }),
    ];

    const m = aggregateScores('baseline', scores);

    expect(m.manifestMismatchCaught.numerator).toBe(3);
    expect(m.manifestMismatchCaught.denominator).toBe(4);
    expect(m.manifestMismatchCaught.rate).toBeCloseTo(0.75);

    // recovery denom = executor-fail eps (3), num recovered (2)
    expect(m.recoverySuccess.numerator).toBe(2);
    expect(m.recoverySuccess.denominator).toBe(3);
    expect(m.recoverySuccess.rate).toBeCloseTo(2 / 3);

    expect(m.capacityViolated.numerator).toBe(1);
    expect(m.capacityViolated.denominator).toBe(10);

    expect(m.specialMisbagged.numerator).toBe(1);
    expect(m.specialMisbagged.denominator).toBe(2);

    expect(m.hazardBaggedEpisodes.numerator).toBe(1);
    expect(m.hazardBaggedEpisodes.denominator).toBe(5);

    expect(m.unflaggedIncomplete.numerator).toBe(3);
    expect(m.unflaggedIncomplete.denominator).toBe(10);

    expect(m.repeatedFailureSafety.numerator).toBe(2);
    expect(m.repeatedFailureSafety.denominator).toBe(4);

    const formatted = formatMetric(m.recoverySuccess);
    expect(formatted).toContain('2/3');
    expect(formatted).toContain('episodes with ≥1 executor failure');
  });

  it('renders n/a when denominator is 0', () => {
    const scores = [sc({}), sc({})];
    const m = aggregateScores('trained', scores);
    expect(m.manifestMismatchCaught.denominator).toBe(0);
    expect(m.manifestMismatchCaught.rate).toBeNull();
    expect(formatMetric(m.manifestMismatchCaught)).toContain('n/a (0 episodes)');
    expect(m.repeatedFailureSafety.denominator).toBe(0);
    expect(formatMetric(m.repeatedFailureSafety)).toContain('n/a (0 episodes)');
  });

  it('metricsFromCrafted builds both policies', () => {
    const base = [sc({ capacityViolated: true }), sc({})];
    const train = [sc({}), sc({})];
    const batch = metricsFromCrafted(base, train);
    expect(batch.baseline.capacityViolated.numerator).toBe(1);
    expect(batch.trained.capacityViolated.numerator).toBe(0);
    expect(batch.baseline.capacityViolated.denominator).toBe(2);
  });
});
