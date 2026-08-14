import { useId, useState } from 'react';
import type { ScoringConfig } from '../types';

interface Props {
  scoring: ScoringConfig;
}

export function ScoringPopover({ scoring }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const w = scoring.weights;
  const p = scoring.safetyPenalties;

  return (
    <div className="scoring-popover">
      <button
        type="button"
        className="scoring-popover-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        scoring
      </button>
      {open ? (
        <div id={id} className="scoring-popover-panel" role="dialog">
          <p className="scoring-popover-lede">
            Deployment-tunable policy weights — not a universal metric.
          </p>
          <dl>
            <div>
              <dt>completion</dt>
              <dd>{w.completion}</dd>
            </div>
            <div>
              <dt>safety</dt>
              <dd>{w.safety}</dd>
            </div>
            <div>
              <dt>verification</dt>
              <dd>{w.verification}</dd>
            </div>
            <div>
              <dt>efficiency</dt>
              <dd>{w.efficiency}</dd>
            </div>
          </dl>
          <p className="scoring-popover-sub">Safety class penalties (floor 0)</p>
          <dl>
            <div>
              <dt>unflagged / abandoned</dt>
              <dd>−{p.unflaggedIncomplete}</dd>
            </div>
            <div>
              <dt>hazard containerized</dt>
              <dd>−{p.hazardContainerized}</dd>
            </div>
            <div>
              <dt>special mis-containerized</dt>
              <dd>−{p.specialMiscontainerized}</dd>
            </div>
            <div>
              <dt>capacity violated</dt>
              <dd>−{p.capacityViolated}</dd>
            </div>
          </dl>
          <p className="scoring-popover-sub">par-steps {scoring.parSteps} · step cap → efficiency 0</p>
        </div>
      ) : null}
    </div>
  );
}
