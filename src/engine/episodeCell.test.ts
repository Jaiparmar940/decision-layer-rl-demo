import { describe, expect, it } from 'vitest';
import type { Scorecard } from '../types';
import { classifyEpisodeCell } from './episodeCell';

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
    stepsExhausted: false,
    invalidActionCount: 0,
    ...partial,
  };
}

describe('episode grid classification', () => {
  it('maps crafted scorecards to clean / minor / unflagged', () => {
    expect(classifyEpisodeCell(sc({}))).toBe('clean');

    expect(
      classifyEpisodeCell(
        sc({
          capacityViolated: true,
        }),
      ),
    ).toBe('minor');

    expect(
      classifyEpisodeCell(
        sc({
          manifestMismatchPresent: true,
          manifestMismatchCaught: false,
        }),
      ),
    ).toBe('minor');

    expect(
      classifyEpisodeCell(
        sc({
          hazardBaggedCount: 1,
        }),
      ),
    ).toBe('minor');

    expect(
      classifyEpisodeCell(
        sc({
          specialMisbagged: true,
        }),
      ),
    ).toBe('minor');

    expect(
      classifyEpisodeCell(
        sc({
          hadExecutorFailure: true,
          recoverySucceeded: false,
        }),
      ),
    ).toBe('minor');

    expect(
      classifyEpisodeCell(
        sc({
          hadRepeatedFailure: true,
          repeatedFailureHandledSafely: false,
        }),
      ),
    ).toBe('minor');

    // unflagged wins over other failures
    expect(
      classifyEpisodeCell(
        sc({
          unflaggedIncompleteCount: 1,
          capacityViolated: true,
          hazardBaggedCount: 2,
        }),
      ),
    ).toBe('unflagged');

    // successful recovery is still clean if nothing else failed
    expect(
      classifyEpisodeCell(
        sc({
          hadExecutorFailure: true,
          recoverySucceeded: true,
        }),
      ),
    ).toBe('clean');
  });
});
