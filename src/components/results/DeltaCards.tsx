import type { MetricValue } from '../../types';
import { SimLabel } from '../SimLabel';

function pct(m: MetricValue): number | null {
  if (m.rate == null || m.denominator === 0) return null;
  return Math.round(m.rate * 100);
}

function frac(m: MetricValue): string {
  if (m.denominator === 0) return 'n/a';
  return `${m.numerator}/${m.denominator}`;
}

function deltaPts(baseline: MetricValue, trained: MetricValue): string | null {
  const b = pct(baseline);
  const t = pct(trained);
  if (b == null || t == null) return null;
  const d = t - b;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d} pts`;
}

interface CardProps {
  title: string;
  baseline: MetricValue;
  trained: MetricValue;
  /** If true, negative delta (trained lower) is good — green chip */
  lowerIsBetter?: boolean;
}

function DeltaCard({ title, baseline, trained, lowerIsBetter }: CardProps) {
  const b = pct(baseline);
  const t = pct(trained);
  const d = deltaPts(baseline, trained);
  const dNum =
    b != null && t != null ? t - b : null;
  const good =
    dNum == null
      ? null
      : lowerIsBetter
        ? dNum < 0
        : dNum > 0;

  return (
    <div className="delta-card">
      <div className="delta-card-title">{title}</div>
      <div className="delta-card-nums">
        <div className="delta-side baseline">
          <div className="delta-big">{b == null ? 'n/a' : `${b}%`}</div>
          <div className="delta-frac mono">{frac(baseline)}</div>
          <div className="delta-pol">BASELINE</div>
        </div>
        <div className="delta-vs">vs</div>
        <div className="delta-side trained">
          <div className="delta-big">{t == null ? 'n/a' : `${t}%`}</div>
          <div className="delta-frac mono">{frac(trained)}</div>
          <div className="delta-pol">TRAINED</div>
        </div>
      </div>
      {d != null && (
        <div
          className={`delta-chip${good === true ? ' good' : good === false ? ' bad' : ''}`}
        >
          {d}
        </div>
      )}
      <SimLabel />
    </div>
  );
}

interface Props {
  composite: {
    baseline: { mean: number; stdev: number };
    trained: { mean: number; stdev: number };
  };
  unflagged: { baseline: MetricValue; trained: MetricValue };
  recovery: { baseline: MetricValue; trained: MetricValue };
  safety: { baseline: MetricValue; trained: MetricValue };
}

function CompositeDelta({
  baseline,
  trained,
}: {
  baseline: { mean: number; stdev: number };
  trained: { mean: number; stdev: number };
}) {
  const d = Math.round(trained.mean - baseline.mean);
  const good = d >= 0;
  return (
    <div className="delta-card composite-delta">
      <div className="delta-card-title">Composite (0–100, tunable)</div>
      <div className="delta-card-nums">
        <div className="delta-side baseline">
          <div className="delta-big">{Math.round(baseline.mean)}</div>
          <div className="delta-frac mono">
            {baseline.mean.toFixed(1)} ± {baseline.stdev.toFixed(1)}
          </div>
          <div className="delta-pol">BASELINE</div>
        </div>
        <div className="delta-vs">vs</div>
        <div className="delta-side trained">
          <div className="delta-big">{Math.round(trained.mean)}</div>
          <div className="delta-frac mono">
            {trained.mean.toFixed(1)} ± {trained.stdev.toFixed(1)}
          </div>
          <div className="delta-pol">TRAINED</div>
        </div>
      </div>
      <div className={`delta-chip${good ? ' good' : ' bad'}`}>
        {d > 0 ? '+' : ''}
        {d} pts
      </div>
      <SimLabel />
    </div>
  );
}

export function DeltaCards({ composite, unflagged, recovery, safety }: Props) {
  return (
    <div className="delta-cards">
      <CompositeDelta baseline={composite.baseline} trained={composite.trained} />
      <DeltaCard
        title="Unflagged incomplete items containerized"
        baseline={unflagged.baseline}
        trained={unflagged.trained}
        lowerIsBetter
      />
      <DeltaCard
        title="Recovery success"
        baseline={recovery.baseline}
        trained={recovery.trained}
      />
      <DeltaCard
        title="Repeated-failure episodes handled safely"
        baseline={safety.baseline}
        trained={safety.trained}
      />
    </div>
  );
}
