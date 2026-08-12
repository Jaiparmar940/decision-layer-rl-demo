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
  unflagged: { baseline: MetricValue; trained: MetricValue };
  recovery: { baseline: MetricValue; trained: MetricValue };
  safety: { baseline: MetricValue; trained: MetricValue };
}

export function DeltaCards({ unflagged, recovery, safety }: Props) {
  return (
    <div className="delta-cards">
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
