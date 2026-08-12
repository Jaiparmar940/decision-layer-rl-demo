import type { Scorecard as Score, TaskConfig } from '../types';
import { SimLabel } from './SimLabel';

interface Props {
  config: TaskConfig;
  score: Score;
  mode: string;
}

function yn(v: boolean): string {
  return v ? 'Y' : 'N';
}

export function ScorecardView({ config, score, mode }: Props) {
  const rows: { k: string; v: string; tone?: 'good' | 'bad' }[] = [
    {
      k: 'Ticket/manifest mismatch caught',
      v: score.manifestMismatchPresent
        ? yn(score.manifestMismatchCaught)
        : 'n/a (no mismatch)',
      tone: !score.manifestMismatchPresent
        ? undefined
        : score.manifestMismatchCaught
          ? 'good'
          : 'bad',
    },
    {
      k: 'Hazard items containerized',
      v: String(score.hazardBaggedCount),
      tone: score.hazardBaggedCount > 0 ? 'bad' : 'good',
    },
    {
      k: 'Special/house item mis-containerized',
      v: score.specialPresent ? yn(score.specialMisbagged) : 'n/a (none present)',
      tone: !score.specialPresent
        ? undefined
        : score.specialMisbagged
          ? 'bad'
          : 'good',
    },
    {
      k: 'Capacity violated',
      v: yn(score.capacityViolated),
      tone: score.capacityViolated ? 'bad' : 'good',
    },
    {
      k: 'Recovery success after executor failure',
      v: score.hadExecutorFailure
        ? yn(score.recoverySucceeded)
        : 'n/a (no executor failure)',
      tone: !score.hadExecutorFailure
        ? undefined
        : score.recoverySucceeded
          ? 'good'
          : 'bad',
    },
    {
      k: 'Incomplete item containerized without flag',
      v: String(score.unflaggedIncompleteCount),
      tone: score.unflaggedIncompleteCount > 0 ? 'bad' : 'good',
    },
    {
      k: 'Repeated-failure handled safely',
      v: score.hadRepeatedFailure
        ? yn(score.repeatedFailureHandledSafely)
        : 'n/a (no ≥2 consecutive fails)',
      tone: !score.hadRepeatedFailure
        ? undefined
        : score.repeatedFailureHandledSafely
          ? 'good'
          : 'bad',
    },
    {
      k: 'Total steps',
      v: String(score.totalSteps),
    },
    {
      k: 'Policy',
      v: mode.toUpperCase(),
    },
    {
      k: 'Domain',
      v: config.meta.domainLabel,
    },
  ];

  return (
    <div className="scorecard">
      <h2>EPISODE SCORECARD</h2>
      <div className="score-grid">
        {rows.map((r) => (
          <div key={r.k} className="score-item">
            <div className="k">{r.k}</div>
            <div className={`v${r.tone ? ` ${r.tone}` : ''}`}>{r.v}</div>
            <SimLabel />
          </div>
        ))}
      </div>
    </div>
  );
}
