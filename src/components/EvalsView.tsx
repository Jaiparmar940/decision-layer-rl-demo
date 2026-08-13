import type { MeasuredRunResult, PolicyMetrics, TaskConfig } from '../types';
import { SimLabel } from './SimLabel';
import { MeasuredLabel } from './MeasuredLabel';

interface Props {
  config: TaskConfig;
  measured: MeasuredRunResult[] | null;
}

const COMPARISON_ROWS: {
  key: keyof PolicyMetrics;
  label: string;
  baseline: number;
  trained: number;
  lowerBetter?: boolean;
}[] = [
  {
    key: 'manifestMismatchCaught',
    label: 'Manifest mismatch caught',
    baseline: 0.3,
    trained: 0.94,
  },
  {
    key: 'hazardBaggedEpisodes',
    label: 'Hazard containerized',
    baseline: 0.3,
    trained: 0.03,
    lowerBetter: true,
  },
  {
    key: 'specialMisbagged',
    label: 'Special mis-containerized',
    baseline: 0.59,
    trained: 0.04,
    lowerBetter: true,
  },
  {
    key: 'capacityViolated',
    label: 'Capacity violated',
    baseline: 0.3,
    trained: 0,
    lowerBetter: true,
  },
  {
    key: 'recoverySuccess',
    label: 'Recovery success',
    baseline: 0.69,
    trained: 0.9,
  },
];

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function EvalsView({ config, measured }: Props) {
  const runs = measured ?? [];

  return (
    <div className="page-view evals-view">
      <header className="page-hero">
        <div>
          <h1 className="page-h1">MODEL EVALS // COMPARISON</h1>
          <p className="page-sub">
            Side-by-side planner metrics for {config.meta.domainLabel}.
          </p>
        </div>
        <div className="page-hero-labels">
          <SimLabel />
          {runs.length > 0 ? <MeasuredLabel /> : null}
        </div>
      </header>

      <div className="evals-table-wrap">
        <table className="evals-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Baseline</th>
              <th>Trained</th>
              <th>Δ</th>
              {runs.map((r) => (
                <th key={r.modelId}>Measured · {r.modelShortName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => {
              const delta = row.lowerBetter
                ? row.baseline - row.trained
                : row.trained - row.baseline;
              const good = delta >= 0;
              return (
                <tr key={row.key}>
                  <td>
                    {row.label}
                    {row.lowerBetter ? (
                      <span className="hint"> · lower better</span>
                    ) : null}
                  </td>
                  <td className="num baseline">{pct(row.baseline)}</td>
                  <td className="num trained">{pct(row.trained)}</td>
                  <td className={`num delta ${good ? 'good' : 'bad'}`}>
                    {good ? '+' : ''}
                    {Math.round(delta * 100)} pts
                  </td>
                  {runs.map((r) => {
                    const metric = r.metrics[row.key];
                    const rate =
                      metric && typeof metric === 'object' && 'rate' in metric
                        ? metric.rate
                        : null;
                    return (
                      <td key={r.modelId} className="num measured">
                        {rate == null ? '—' : pct(rate)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
