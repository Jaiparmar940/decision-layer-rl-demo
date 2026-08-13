import type { Scorecard as Score, TaskConfig } from '../types';
import { scoringOf } from '../config/scoring';
import { compositeScore } from '../engine/composite';
import { fracNote, yn } from '../engine/scoreDisplay';
import { CompositeNumeral } from './CompositeNumeral';
import { ScoringPopover } from './ScoringPopover';
import { SimLabel } from './SimLabel';

interface Props {
  config: TaskConfig;
  score: Score | null;
  mode: string;
}

const PLACEHOLDER = '—';

export function ScorecardView({ config, score, mode }: Props) {
  const scoring = scoringOf(config);
  const composite = score ? compositeScore(score, scoring) : null;
  const incomplete = score ? !score.taskCompleted : false;

  const rows: { k: string; v: string; tone?: 'good' | 'bad' | 'mute'; note?: string }[] =
    score
      ? [
          {
            k: 'Items resolved',
            v: `${score.itemsResolved}/${score.itemsPresent} items present`,
            tone: score.itemsResolved === score.itemsPresent ? 'good' : 'bad',
            note: 'legitimate terminal: containerized correctly / set aside correctly / flagged',
          },
          {
            k: 'Task completed',
            v: yn(score.taskCompleted),
            tone: score.taskCompleted ? 'good' : 'bad',
            note: 'all items resolved AND ended via finish or justified escalate (not step cap / abandonment)',
          },
          {
            k: 'Step cap hit',
            v: score.stepsExhausted
              ? `Y — ${score.totalSteps} steps (cap)`
              : `N — ${score.totalSteps} steps`,
            tone: score.stepsExhausted ? 'bad' : 'good',
          },
          {
            k: 'Ticket/manifest mismatch caught',
            v: score.manifestMismatchPresent
              ? yn(score.manifestMismatchCaught)
              : 'n/a (0 mismatches present — not scored)',
            tone: !score.manifestMismatchPresent
              ? 'mute'
              : score.manifestMismatchCaught
                ? 'good'
                : 'bad',
            note: score.manifestMismatchPresent
              ? 'denominator = mismatch present this episode'
              : undefined,
          },
          {
            k: 'Hazard items containerized',
            ...(() => {
              const f = fracNote(score.hazardBaggedCount, score.hazardItemCount, 'hazard items', {
                incomplete,
                invertGood: true,
              });
              return { v: f.text, tone: f.tone };
            })(),
          },
          {
            k: 'Special/house item mis-containerized',
            ...(() => {
              const f = fracNote(
                score.specialMisbaggedCount,
                score.specialItemCount,
                'special items',
                { incomplete, invertGood: true },
              );
              return { v: f.text, tone: f.tone };
            })(),
          },
          {
            k: 'Capacity violated',
            v: yn(score.capacityViolated),
            tone: score.capacityViolated ? 'bad' : incomplete ? 'mute' : 'good',
            note: incomplete && !score.capacityViolated
              ? '0 is not a success while the episode is incomplete'
              : undefined,
          },
          {
            k: 'Recovery success after executor failure',
            v: score.hadExecutorFailure
              ? yn(score.recoverySucceeded)
              : 'n/a (0 executor-failure items — not scored)',
            tone: !score.hadExecutorFailure
              ? 'mute'
              : score.recoverySucceeded
                ? 'good'
                : 'bad',
          },
          {
            k: 'Incomplete item containerized without flag',
            v: String(score.unflaggedIncompleteCount),
            tone: score.unflaggedIncompleteCount > 0 ? 'bad' : incomplete ? 'mute' : 'good',
          },
          {
            k: 'Repeated-failure handled safely',
            v: score.hadRepeatedFailure
              ? yn(score.repeatedFailureHandledSafely)
              : 'n/a (0 items with ≥2 consecutive fails — not scored)',
            tone: !score.hadRepeatedFailure
              ? 'mute'
              : score.repeatedFailureHandledSafely
                ? 'good'
                : 'bad',
          },
          {
            k: 'Invalid planner actions',
            v: String(score.invalidActionCount),
            tone: score.invalidActionCount > 0 ? 'bad' : undefined,
          },
          {
            k: 'Policy',
            v: mode.toUpperCase(),
          },
          {
            k: 'Domain',
            v: config.meta.domainLabel,
          },
        ]
      : [
          { k: 'Items resolved', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Task completed', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Step cap hit', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Ticket/manifest mismatch caught', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Hazard items containerized', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Special/house item mis-containerized', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Capacity violated', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Recovery success after executor failure', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Incomplete item containerized without flag', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Repeated-failure handled safely', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Invalid planner actions', v: PLACEHOLDER, tone: 'mute' },
          { k: 'Policy', v: mode.toUpperCase() },
          { k: 'Domain', v: config.meta.domainLabel },
        ];

  return (
    <div className={`scorecard${score ? '' : ' pending'}${incomplete ? ' incomplete' : ''}`}>
      {incomplete ? <div className="incomplete-banner">INCOMPLETE</div> : null}
      <h2>
        EPISODE SCORECARD
        {!score ? <span className="scorecard-pending"> // PENDING</span> : null}
        <ScoringPopover scoring={scoring} />
      </h2>
      {composite ? (
        <CompositeNumeral value={composite} />
      ) : null}
      <div className="score-grid">
        {rows.map((r) => (
          <div key={r.k} className="score-item">
            <div className="k">{r.k}</div>
            <div className={`v${r.tone ? ` ${r.tone}` : ''}`}>{r.v}</div>
            {r.note ? <div className="score-note">{r.note}</div> : null}
            <SimLabel />
          </div>
        ))}
      </div>
    </div>
  );
}
