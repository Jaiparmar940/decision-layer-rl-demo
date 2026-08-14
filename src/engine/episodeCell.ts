import type { Scorecard } from '../types';

/** Visual class for one episode square in the RESULTS strip. */
export type EpisodeCellKind = 'clean' | 'minor' | 'unflagged' | 'incomplete';

/**
 * Classify a single episode scorecard for the RESULTS episode strip.
 * Priority: unflagged-incomplete > incomplete (task not finished) > minor > clean.
 */
export function classifyEpisodeCell(score: Scorecard): EpisodeCellKind {
  if (score.unflaggedIncompleteCount > 0) return 'unflagged';
  if (!score.taskCompleted) return 'incomplete';

  const minor =
    (score.manifestMismatchPresent && !score.manifestMismatchCaught) ||
    score.hazardBaggedCount > 0 ||
    score.specialMisbagged ||
    score.capacityViolated ||
    (score.hadExecutorFailure && !score.recoverySucceeded) ||
    (score.hadRepeatedFailure && !score.repeatedFailureHandledSafely);

  return minor ? 'minor' : 'clean';
}

export function classifyEpisodeCells(scores: Scorecard[]): EpisodeCellKind[] {
  return scores.map(classifyEpisodeCell);
}
