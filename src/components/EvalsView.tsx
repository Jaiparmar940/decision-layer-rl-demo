import { useMemo, useState } from 'react';
import type { MeasuredRunResult, PolicyMetrics, TaskConfig } from '../types';
import { runBatch } from '../engine/batch';
import { formatMetric } from '../engine/metrics';
import { ScoringPopover } from './ScoringPopover';
import { SimLabel } from './SimLabel';
import { MeasuredLabel } from './MeasuredLabel';

interface Props {
  config: TaskConfig;
  measured: MeasuredRunResult[] | null;
}

type RankKey =
  | 'composite'
  | 'completion'
  | 'safety'
  | 'verification'
  | 'efficiency'
  | 'taskCompleted';

interface RankRow {
  id: string;
  name: string;
  kind: 'baseline' | 'trained' | 'measured';
  metrics: PolicyMetrics;
  episodeCount: number;
}

function compositeCell(m: PolicyMetrics): string {
  if (typeof m.compositeMean !== 'number') return '—';
  return `${m.compositeMean.toFixed(1)} ± ${m.compositeStdev.toFixed(1)}`;
}

function sortValue(row: RankRow, key: RankKey): number {
  const m = row.metrics;
  switch (key) {
    case 'composite':
      return m.compositeMean ?? -1;
    case 'completion':
      return m.compositeComponents?.completion ?? -1;
    case 'safety':
      return m.compositeComponents?.safety ?? -1;
    case 'verification':
      return m.compositeComponents?.verification ?? -1;
    case 'efficiency':
      return m.compositeComponents?.efficiency ?? -1;
    case 'taskCompleted':
      return m.taskCompleted?.rate ?? -1;
  }
}

export function EvalsView({ config, measured }: Props) {
  const runs = measured ?? [];
  const [sortKey, setSortKey] = useState<RankKey>('composite');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const scripted = useMemo(() => runBatch(config, 80), [config]);

  const rows: RankRow[] = useMemo(() => {
    const list: RankRow[] = [
      {
        id: 'baseline',
        name: 'BASELINE',
        kind: 'baseline',
        metrics: scripted.baseline,
        episodeCount: scripted.baseline.episodes,
      },
      {
        id: 'trained',
        name: 'TRAINED',
        kind: 'trained',
        metrics: scripted.trained,
        episodeCount: scripted.trained.episodes,
      },
      ...runs.map((r) => ({
        id: r.modelId,
        name: r.modelShortName,
        kind: 'measured' as const,
        metrics: r.metrics,
        episodeCount: r.episodeCount,
      })),
    ];
    const dir = sortDir === 'desc' ? -1 : 1;
    return list.sort((a, b) => dir * (sortValue(a, sortKey) - sortValue(b, sortKey)));
  }, [scripted, runs, sortKey, sortDir]);

  const onSort = (key: RankKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const mark = (key: RankKey) =>
    sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div className="page-view evals-view">
      <header className="page-hero">
        <div>
          <h1 className="page-h1">MODEL EVALS // COMPARISON</h1>
          <p className="page-sub">
            Ranked by composite (mean ± σ across episodes) for{' '}
            {config.meta.domainLabel}. Weights are a deployment-tunable policy.
          </p>
        </div>
        <div className="page-hero-labels">
          <ScoringPopover scoring={config.scoring} />
          <SimLabel />
          {runs.length > 0 ? <MeasuredLabel /> : null}
        </div>
      </header>

      <div className="evals-table-wrap">
        <table className="evals-table">
          <thead>
            <tr>
              <th>Policy / model</th>
              <th>
                <button type="button" className="sort-th" onClick={() => onSort('composite')}>
                  Composite{mark('composite')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => onSort('completion')}>
                  Completion{mark('completion')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => onSort('safety')}>
                  Safety{mark('safety')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => onSort('verification')}>
                  Verification{mark('verification')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => onSort('efficiency')}>
                  Efficiency{mark('efficiency')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => onSort('taskCompleted')}>
                  Task completed{mark('taskCompleted')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const m = row.metrics;
              const c = m.compositeComponents;
              const incomplete =
                (m.taskCompleted?.numerator ?? 0) === 0 && row.episodeCount > 0;
              return (
                <tr
                  key={row.id}
                  className={`${row.kind}${incomplete ? ' incomplete-row' : ''}`}
                >
                  <td>
                    {row.name}
                    <span className="hint">
                      {' '}
                      · {row.episodeCount} eps
                      {row.kind === 'measured' ? ' · measured' : ' · simulated'}
                    </span>
                    {incomplete ? (
                      <span className="incomplete-inline"> INCOMPLETE</span>
                    ) : null}
                  </td>
                  <td className={`num rank-composite ${row.kind}`}>
                    {compositeCell(m)}
                  </td>
                  <td className="num">{c ? c.completion.toFixed(1) : '—'}</td>
                  <td className="num">{c ? c.safety.toFixed(1) : '—'}</td>
                  <td className="num">{c ? c.verification.toFixed(1) : '—'}</td>
                  <td className="num">{c ? c.efficiency.toFixed(1) : '—'}</td>
                  <td className="num">
                    {m.taskCompleted ? formatMetric(m.taskCompleted).replace(/^Task completed: /, '') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
