import { describe, expect, it } from 'vitest';
import { classifyEpisodeCell } from './episodeCell';
import { emptyScorecard } from './score';

const sc = emptyScorecard;

describe('episode grid classification', () => {
  it('maps crafted scorecards to clean / minor / unflagged / incomplete', () => {
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

    expect(
      classifyEpisodeCell(
        sc({
          taskCompleted: false,
          itemsResolved: 0,
          stepsExhausted: true,
        }),
      ),
    ).toBe('incomplete');
  });
});
