import type { Scorecard } from '../types';

/** Episode-level fraction with an explicit denominator; never imply virtue from a 0/0. */
export function fracNote(
  numerator: number,
  denominator: number,
  unit: string,
  opts?: { incomplete?: boolean; invertGood?: boolean },
): { text: string; tone?: 'good' | 'bad' | 'mute' } {
  if (denominator === 0) {
    return {
      text: `n/a (0 ${unit} present — not scored)`,
      tone: 'mute',
    };
  }
  const text = `${numerator}/${denominator} ${unit} present`;
  if (opts?.incomplete && numerator === 0 && opts.invertGood) {
    return {
      text: `${text} (episode INCOMPLETE — not a success)`,
      tone: 'bad',
    };
  }
  if (opts?.invertGood) {
    return { text, tone: numerator > 0 ? 'bad' : 'good' };
  }
  return { text, tone: numerator > 0 ? 'good' : 'bad' };
}

export function yn(v: boolean): string {
  return v ? 'Y' : 'N';
}

export function completionLine(score: Scorecard): {
  resolved: string;
  completed: string;
  exhausted: string;
} {
  return {
    resolved: `${score.itemsResolved}/${score.itemsPresent} items`,
    completed: score.taskCompleted ? 'Y' : 'N',
    exhausted: score.stepsExhausted ? 'Y (cap)' : 'N',
  };
}
