import type { MetricValue } from '../../types';
import { SimLabel } from '../SimLabel';

function pct(m: MetricValue): number | null {
  if (m.rate == null || m.denominator === 0) return null;
  return Math.round(m.rate * 100);
}

function frac(m: MetricValue): string {
  if (m.denominator === 0) return 'n/a (0)';
  return `${m.numerator}/${m.denominator}`;
}

interface RowProps {
  label: string;
  baseline: MetricValue;
  trained: MetricValue;
}

function DumbbellRow({ label, baseline, trained }: RowProps) {
  const b = pct(baseline);
  const t = pct(trained);
  const bPos = b ?? 0;
  const tPos = t ?? 0;
  const left = Math.min(bPos, tPos);
  const width = Math.abs(tPos - bPos);
  const title = `BASELINE ${frac(baseline)}${b != null ? ` (${b}%)` : ''} · TRAINED ${frac(trained)}${t != null ? ` (${t}%)` : ''}`;

  return (
    <div className="dumbbell-row" title={title}>
      <div className="dumbbell-label">{label}</div>
      <div className="dumbbell-track-wrap">
        <svg
          className="dumbbell-svg"
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          aria-hidden
        >
          <line
            x1="0"
            y1="8"
            x2="100"
            y2="8"
            className="dumbbell-axis"
          />
          {b != null && t != null && width > 0 && (
            <line
              x1={left}
              y1="8"
              x2={left + width}
              y2="8"
              className="dumbbell-link"
            />
          )}
          {b != null && (
            <circle cx={bPos} cy="8" r="3.2" className="dumbbell-dot baseline" />
          )}
          {t != null && (
            <circle cx={tPos} cy="8" r="3.2" className="dumbbell-dot trained" />
          )}
        </svg>
        <div className="dumbbell-value-row">
          <span className="v-baseline">
            {b == null ? 'n/a' : `${b}%`}
          </span>
          <span className="v-trained">
            {t == null ? 'n/a' : `${t}%`}
          </span>
        </div>
        <div className="dumbbell-frac mono">
          B {frac(baseline)} · T {frac(trained)}
        </div>
      </div>
    </div>
  );
}

interface StepsRowProps {
  baselineMean: number;
  trainedMean: number;
  maxSteps?: number;
}

function StepsRow({ baselineMean, trainedMean, maxSteps = 80 }: StepsRowProps) {
  const bPos = Math.min(100, (baselineMean / maxSteps) * 100);
  const tPos = Math.min(100, (trainedMean / maxSteps) * 100);
  const left = Math.min(bPos, tPos);
  const width = Math.abs(tPos - bPos);
  const title = `BASELINE ${baselineMean.toFixed(1)} steps · TRAINED ${trainedMean.toFixed(1)} steps`;

  return (
    <div className="dumbbell-row" title={title}>
      <div className="dumbbell-label">Mean steps / episode</div>
      <div className="dumbbell-track-wrap">
        <svg
          className="dumbbell-svg"
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          aria-hidden
        >
          <line x1="0" y1="8" x2="100" y2="8" className="dumbbell-axis" />
          {width > 0 && (
            <line
              x1={left}
              y1="8"
              x2={left + width}
              y2="8"
              className="dumbbell-link"
            />
          )}
          <circle cx={bPos} cy="8" r="3.2" className="dumbbell-dot baseline" />
          <circle cx={tPos} cy="8" r="3.2" className="dumbbell-dot trained" />
        </svg>
        <div className="dumbbell-value-row">
          <span className="v-baseline">{Math.round(baselineMean)}</span>
          <span className="v-trained">{Math.round(trainedMean)}</span>
        </div>
        <div className="dumbbell-frac mono">
          B {baselineMean.toFixed(1)} · T {trainedMean.toFixed(1)} (axis 0–
          {maxSteps})
        </div>
      </div>
    </div>
  );
}

interface Props {
  mismatch: { baseline: MetricValue; trained: MetricValue };
  hazard: { baseline: MetricValue; trained: MetricValue };
  special: { baseline: MetricValue; trained: MetricValue };
  capacity: { baseline: MetricValue; trained: MetricValue };
  meanSteps: { baseline: number; trained: number };
}

export function DumbbellChart({
  mismatch,
  hazard,
  special,
  capacity,
  meanSteps,
}: Props) {
  return (
    <div className="dumbbell-chart">
      <div className="results-section-h">COMPARISON — REMAINING METRICS</div>
      <div className="dumbbell-legend">
        <span className="lg-b">● BASELINE</span>
        <span className="lg-t">● TRAINED</span>
        <SimLabel />
      </div>
      <DumbbellRow
        label="Manifest mismatch caught"
        baseline={mismatch.baseline}
        trained={mismatch.trained}
      />
      <DumbbellRow
        label="Hazard item containerized"
        baseline={hazard.baseline}
        trained={hazard.trained}
      />
      <DumbbellRow
        label="Special item mis-containerized"
        baseline={special.baseline}
        trained={special.trained}
      />
      <DumbbellRow
        label="Capacity violated"
        baseline={capacity.baseline}
        trained={capacity.trained}
      />
      <StepsRow
        baselineMean={meanSteps.baseline}
        trainedMean={meanSteps.trained}
      />
    </div>
  );
}
