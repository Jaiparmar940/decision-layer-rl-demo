import { useEffect, useState } from 'react';
import type { Scorecard as Score, TaskConfig } from '../types';
import { scoringOf } from '../config/scoring';
import { compositeScore } from '../engine/composite';
import { fracNote, scoreEndedBy, yn } from '../engine/scoreDisplay';
import { CompositeNumeral } from './CompositeNumeral';
import { ScoringPopover } from './ScoringPopover';
import { SimLabel } from './SimLabel';

interface Props {
  config: TaskConfig;
  score: Score | null;
  mode: string;
}

const PLACEHOLDER = '—';

type Tone = 'good' | 'bad' | 'mute';

interface ScoreRow {
  k: string;
  v: string;
  tone?: Tone;
  note?: string;
}

interface ScoreSection {
  title: string;
  rows: ScoreRow[];
}

function sectionsFor(
  score: Score,
  config: TaskConfig,
  mode: string,
): ScoreSection[] {
  const scoring = scoringOf(config);
  const incomplete = !score.taskCompleted;
  const ended = scoreEndedBy(score);

  return [
    {
      title: 'Completion',
      rows: [
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
          k: 'Ended by',
          v: ended,
          tone: ended === 'step-cap' || ended === 'incomplete' ? 'bad' : 'good',
        },
        {
          k: 'Step cap hit',
          v: score.stepsExhausted
            ? `Y — ${score.totalSteps} steps (cap)`
            : `N — ${score.totalSteps} steps`,
          tone: score.stepsExhausted ? 'bad' : 'good',
        },
        {
          k: 'Escalated',
          v: yn(score.escalated),
          tone: score.escalated && !score.taskCompleted ? 'bad' : undefined,
        },
      ],
    },
    {
      title: 'Verification',
      rows: [
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
      ],
    },
    {
      title: 'Safety',
      rows: [
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
          note:
            incomplete && !score.capacityViolated
              ? '0 is not a success while the episode is incomplete'
              : undefined,
        },
        {
          k: 'Incomplete item containerized without flag',
          v: String(score.unflaggedIncompleteCount),
          tone: score.unflaggedIncompleteCount > 0 ? 'bad' : incomplete ? 'mute' : 'good',
        },
        {
          k: 'Flagged incomplete (legitimate terminal)',
          v: String(score.flaggedIncompleteCount),
          tone: score.flaggedIncompleteCount > 0 ? 'good' : 'mute',
          note: 'counts toward itemsResolved; not a safety penalty',
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
      ],
    },
    {
      title: 'Efficiency',
      rows: [
        {
          k: 'Steps vs par',
          v: score.stepsExhausted
            ? `${score.totalSteps} (cap → efficiency 0; par ${scoring.parSteps})`
            : `${score.totalSteps} (par ${scoring.parSteps})`,
          tone: score.stepsExhausted ? 'bad' : undefined,
        },
        {
          k: 'Invalid planner actions',
          v: String(score.invalidActionCount),
          tone: score.invalidActionCount > 0 ? 'bad' : undefined,
        },
      ],
    },
    {
      title: 'Run',
      rows: [
        { k: 'Policy', v: mode.toUpperCase() },
        { k: 'Domain', v: config.meta.domainLabel },
      ],
    },
  ];
}

function placeholderSections(config: TaskConfig, mode: string): ScoreSection[] {
  const mute = (k: string): ScoreRow => ({ k, v: PLACEHOLDER, tone: 'mute' });
  return [
    {
      title: 'Completion',
      rows: [
        mute('Items resolved'),
        mute('Task completed'),
        mute('Ended by'),
        mute('Step cap hit'),
        mute('Escalated'),
      ],
    },
    {
      title: 'Verification',
      rows: [mute('Ticket/manifest mismatch caught')],
    },
    {
      title: 'Safety',
      rows: [
        mute('Hazard items containerized'),
        mute('Special/house item mis-containerized'),
        mute('Capacity violated'),
        mute('Incomplete item containerized without flag'),
        mute('Flagged incomplete (legitimate terminal)'),
        mute('Recovery success after executor failure'),
        mute('Repeated-failure handled safely'),
      ],
    },
    {
      title: 'Efficiency',
      rows: [mute('Steps vs par'), mute('Invalid planner actions')],
    },
    {
      title: 'Run',
      rows: [
        { k: 'Policy', v: mode.toUpperCase() },
        { k: 'Domain', v: config.meta.domainLabel },
      ],
    },
  ];
}

export function ScorecardView({ config, score, mode }: Props) {
  const scoring = scoringOf(config);
  const composite = score ? compositeScore(score, scoring) : null;
  const incomplete = score ? !score.taskCompleted : false;
  const sections = score
    ? sectionsFor(score, config, mode)
    : placeholderSections(config, mode);

  return (
    <div className={`scorecard${score ? '' : ' pending'}${incomplete ? ' incomplete' : ''}`}>
      {incomplete ? <div className="incomplete-banner">INCOMPLETE</div> : null}
      <h2>
        EPISODE SCORECARD
        {!score ? <span className="scorecard-pending"> // PENDING</span> : null}
        <ScoringPopover scoring={scoring} />
      </h2>
      {composite ? <CompositeNumeral value={composite} /> : null}
      {sections.map((sec) => (
        <div key={sec.title} className="score-section">
          <div className="score-section-h">{sec.title}</div>
          <div className="score-grid">
            {sec.rows.map((r) => (
              <div key={r.k} className="score-item">
                <div className="k">{r.k}</div>
                <div className={`v${r.tone ? ` ${r.tone}` : ''}`}>{r.v}</div>
                {r.note ? <div className="score-note">{r.note}</div> : null}
                <SimLabel />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact live-view strip + modal for the full grader scorecard. */
export function LiveScorecardBar({ config, score, mode }: Props) {
  const [open, setOpen] = useState(false);
  const scoring = scoringOf(config);
  const composite = score ? compositeScore(score, scoring) : null;
  const incomplete = score ? !score.taskCompleted : false;
  const ended = score ? scoreEndedBy(score) : null;

  useEffect(() => {
    if (!score) setOpen(false);
  }, [score]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div
        className={`scorecard-dock${score ? '' : ' pending'}${incomplete ? ' incomplete' : ''}`}
      >
        {incomplete ? <div className="scorecard-dock-flag">INCOMPLETE</div> : null}
        <div className="scorecard-dock-main">
          {composite ? (
            <CompositeNumeral value={composite} size="md" />
          ) : (
            <div className="scorecard-dock-pending">
              EPISODE SCORECARD
              <span className="scorecard-pending"> // PENDING</span>
            </div>
          )}
          <div className="scorecard-dock-facts">
            <div>
              <div className="k">Items resolved</div>
              <div className={`v${score && score.itemsResolved < score.itemsPresent ? ' bad' : score ? ' good' : ' mute'}`}>
                {score ? `${score.itemsResolved}/${score.itemsPresent}` : PLACEHOLDER}
              </div>
            </div>
            <div>
              <div className="k">Task completed</div>
              <div className={`v${score ? (score.taskCompleted ? ' good' : ' bad') : ' mute'}`}>
                {score ? yn(score.taskCompleted) : PLACEHOLDER}
              </div>
            </div>
            <div>
              <div className="k">Ended by</div>
              <div className={`v${ended === 'incomplete' || ended === 'step-cap' ? ' bad' : ended ? ' good' : ' mute'}`}>
                {ended ?? PLACEHOLDER}
              </div>
            </div>
            <div>
              <div className="k">Steps</div>
              <div className="v">
                {score ? score.totalSteps : PLACEHOLDER}
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="primary scorecard-dock-btn"
          disabled={!score}
          onClick={() => setOpen(true)}
        >
          See episode scorecard
        </button>
      </div>
      {open && score ? (
        <div
          className="scorecard-modal-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="scorecard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="episode-scorecard-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scorecard-modal-bar">
              <span id="episode-scorecard-title">Episode scorecard</span>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <ScorecardView config={config} score={score} mode={mode} />
          </div>
        </div>
      ) : null}
    </>
  );
}
