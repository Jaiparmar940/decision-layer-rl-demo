import type { GraderEvidence } from '../../engine/manual/evidence';
import type { TaskConfig } from '../../types';
import { ScorecardView } from '../Scorecard';
import { yn } from '../../engine/scoreDisplay';

interface Props {
  evidence: GraderEvidence;
  config: TaskConfig;
}

export function GraderReport({ evidence, config }: Props) {
  const s = evidence.score;
  const m = evidence.manifestMismatchCaught;
  const incomplete = !s.taskCompleted;

  return (
    <div className="grader-stack">
      <ScorecardView config={config} score={s} mode="manual" />
      <div className={`grader-report${incomplete ? ' incomplete' : ''}`}>
      <h2>GRADER REPORT // EVIDENCE</h2>
      <div className="grader-grid">
        <section>
          <h3>
            itemsResolved · {s.itemsResolved}/{s.itemsPresent} items present
          </h3>
          <p>legitimate terminal: containerized correctly / set aside correctly / flagged</p>
          <p>
            taskCompleted: {yn(s.taskCompleted)} · stepsExhausted:{' '}
            {s.stepsExhausted ? `Y (${s.totalSteps} cap)` : 'N'}
          </p>
        </section>
        <section>
          <h3>manifestMismatchCaught · {m.present ? yn(s.manifestMismatchCaught) : 'n/a'}</h3>
          <p>
            claimed {m.claimed} vs actual {m.actual}
            {m.present ? ' (mismatch present)' : ' (0 mismatches present — not scored)'}
          </p>
          <p>
            checkManifest step:{' '}
            {m.checkManifestStep != null ? `#${m.checkManifestStep}` : 'never issued'}
          </p>
        </section>
        <section>
          <h3>
            hazardBagged · {s.hazardBaggedCount}/{s.hazardItemCount} hazard items present
          </h3>
          {s.hazardItemCount === 0 ? (
            <p>n/a (0 hazard items present — not scored)</p>
          ) : evidence.hazardBagged.length === 0 ? (
            <p>
              {incomplete
                ? '0 bagged — episode INCOMPLETE, not a success'
                : 'none bagged'}
            </p>
          ) : (
            <ul>
              {evidence.hazardBagged.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>
            specialMisbagged · {s.specialMisbaggedCount}/{s.specialItemCount} special items
            present
          </h3>
          {s.specialItemCount === 0 ? (
            <p>n/a (0 special items present — not scored)</p>
          ) : evidence.specialMisbagged.length === 0 ? (
            <p>
              {incomplete
                ? '0 mis-containerized — episode INCOMPLETE, not a success'
                : 'none'}
            </p>
          ) : (
            <ul>
              {evidence.specialMisbagged.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>capacityViolated · {yn(s.capacityViolated)}</h3>
          {evidence.capacityViolated.length === 0 ? (
            <p>
              {incomplete && !s.capacityViolated
                ? '0 — not a success while incomplete'
                : 'none'}
            </p>
          ) : (
            <ul>
              {evidence.capacityViolated.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="grader-span">
          <h3>
            recovery ledger · success {s.hadExecutorFailure ? yn(s.recoverySucceeded) : 'n/a'} ·
            repeated-fail safety{' '}
            {s.hadRepeatedFailure ? yn(s.repeatedFailureHandledSafely) : 'n/a'}
          </h3>
          {evidence.recoveryLedger.length === 0 ? (
            <p>no executor failures</p>
          ) : (
            <ul>
              {evidence.recoveryLedger.map((row) => (
                <li key={row.itemId}>
                  {row.itemLabel} skill={row.skillId} attempts={row.attempts} resolution=
                  {row.resolution} — {row.recoverySuccessClass}; {row.repeatedFailureSafetyClass}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>unflaggedIncomplete · {s.unflaggedIncompleteCount}</h3>
          {evidence.unflaggedIncomplete.length === 0 ? (
            <p>none</p>
          ) : (
            <ul>
              {evidence.unflaggedIncomplete.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>totalSteps · {evidence.totalSteps}</h3>
          <p>stepsExhausted: {yn(evidence.stepsExhausted)}</p>
          <p>invalid planner actions: {s.invalidActionCount}</p>
        </section>
      </div>
      </div>
    </div>
  );
}
