import { describe, expect, it } from 'vitest';
import { aggregateScores, formatMetric, metricsFromCrafted } from './metrics';
import { emptyScorecard } from './score';

const sc = emptyScorecard;

describe('dashboard denominators', () => {
  it('uses conditional denominators on a crafted set', () => {
    // 10 episodes: 4 with mismatch (3 caught), 3 with executor fail (2 recovered)
    // 5 with hazard present (1 bagged), 2 special (1 misbagged)
    // 3 unflagged incomplete, 4 repeated-fail (2 safe)
    const scores = [
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: true,
        hadExecutorFailure: true,
        recoverySucceeded: true,
        hazardPresent: true,
        hazardItemCount: 1,
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: true,
      }),
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: true,
        hadExecutorFailure: true,
        recoverySucceeded: true,
        hazardPresent: true,
        hazardItemCount: 1,
        unflaggedIncompleteCount: 1,
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: false,
        taskCompleted: false,
        itemsResolved: 6,
      }),
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: true,
        hadExecutorFailure: true,
        recoverySucceeded: false,
        hazardPresent: true,
        hazardItemCount: 2,
        hazardBaggedCount: 2,
        unflaggedIncompleteCount: 2,
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: false,
        taskCompleted: false,
        itemsResolved: 4,
      }),
      sc({
        manifestMismatchPresent: true,
        manifestMismatchCaught: false,
        hazardPresent: true,
        hazardItemCount: 1,
        taskCompleted: false,
        itemsResolved: 7,
      }),
      sc({ capacityViolated: true, unflaggedIncompleteCount: 1, taskCompleted: false, itemsResolved: 5 }),
      sc({}),
      sc({ specialPresent: true, specialItemCount: 1, specialMisbagged: true, specialMisbaggedCount: 1, taskCompleted: false, itemsResolved: 6 }),
      sc({ specialPresent: true, specialItemCount: 1, specialMisbagged: false }),
      sc({ hazardPresent: true, hazardItemCount: 1 }),
      sc({
        hadRepeatedFailure: true,
        repeatedFailureHandledSafely: true,
      }),
    ];

    const m = aggregateScores('baseline', scores);

    expect(m.manifestMismatchCaught.numerator).toBe(3);
    expect(m.manifestMismatchCaught.denominator).toBe(4);
    expect(m.manifestMismatchCaught.rate).toBeCloseTo(0.75);
    expect(m.manifestMismatchCaught.denomNote.length).toBeGreaterThan(0);

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

  it('renders n/a when denominator is 0 and does not read as virtue', () => {
    const scores = [sc({ itemsPresent: 8, itemsResolved: 0, taskCompleted: false }), sc({ itemsPresent: 8, itemsResolved: 0, taskCompleted: false })];
    const m = aggregateScores('trained', scores);
    expect(m.manifestMismatchCaught.denominator).toBe(0);
    expect(m.manifestMismatchCaught.rate).toBeNull();
    expect(formatMetric(m.manifestMismatchCaught)).toContain('n/a');
    expect(formatMetric(m.manifestMismatchCaught)).toMatch(/not scored|inaction/i);
    expect(m.repeatedFailureSafety.denominator).toBe(0);
    expect(formatMetric(m.repeatedFailureSafety)).toContain('n/a');
    expect(m.hazardBaggedEpisodes.incompleteInDenominator).toBe(0);
  });

  it('annotates zero-by-inaction when all denom episodes are incomplete', () => {
    const scores = [
      sc({
        hazardPresent: true,
        hazardItemCount: 2,
        hazardBaggedCount: 0,
        taskCompleted: false,
        itemsResolved: 0,
        stepsExhausted: true,
      }),
      sc({
        hazardPresent: true,
        hazardItemCount: 1,
        hazardBaggedCount: 0,
        taskCompleted: false,
        itemsResolved: 0,
        stepsExhausted: true,
      }),
    ];
    const m = aggregateScores('llm', scores);
    expect(m.hazardBaggedEpisodes.numerator).toBe(0);
    expect(m.hazardBaggedEpisodes.denominator).toBe(2);
    expect(m.hazardBaggedEpisodes.incompleteInDenominator).toBe(2);
    expect(formatMetric(m.hazardBaggedEpisodes)).toMatch(/INCOMPLETE|inaction/i);
  });

  it('metricsFromCrafted builds both policies', () => {
    const base = [sc({ capacityViolated: true, taskCompleted: false, itemsResolved: 6 }), sc({})];
    const train = [sc({}), sc({})];
    const batch = metricsFromCrafted(base, train);
    expect(batch.baseline.capacityViolated.numerator).toBe(1);
    expect(batch.trained.capacityViolated.numerator).toBe(0);
    expect(batch.baseline.capacityViolated.denominator).toBe(2);
    expect(typeof batch.baseline.compositeMean).toBe('number');
  });
});
