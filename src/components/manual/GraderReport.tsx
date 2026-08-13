import type { GraderEvidence } from '../../engine/manual/evidence';

interface Props {
  evidence: GraderEvidence;
}

function yn(v: boolean): string {
  return v ? 'Y' : 'N';
}

export function GraderReport({ evidence }: Props) {
  const s = evidence.score;
  const m = evidence.manifestMismatchCaught;

  return (
    <div className="grader-report">
      <h2>GRADER REPORT // EVIDENCE</h2>
      <div className="grader-grid">
        <section>
          <h3>manifestMismatchCaught · {m.present ? yn(s.manifestMismatchCaught) : 'n/a'}</h3>
          <p>
            claimed {m.claimed} vs actual {m.actual}
            {m.present ? ' (mismatch present)' : ' (no mismatch)'}
          </p>
          <p>
            checkManifest step:{' '}
            {m.checkManifestStep != null ? `#${m.checkManifestStep}` : 'never issued'}
          </p>
        </section>
        <section>
          <h3>hazardBagged · {s.hazardBaggedCount}</h3>
          {evidence.hazardBagged.length === 0 ? (
            <p>none</p>
          ) : (
            <ul>
              {evidence.hazardBagged.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>specialMisbagged · {yn(s.specialMisbagged)}</h3>
          {evidence.specialMisbagged.length === 0 ? (
            <p>none</p>
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
            <p>none</p>
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
  );
}
