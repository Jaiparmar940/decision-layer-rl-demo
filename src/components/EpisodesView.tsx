import type { TaskConfig } from '../types';
import { useMemo, useState } from 'react';
import { SimLabel } from './SimLabel';

interface Props {
  config: TaskConfig;
}

interface EpisodeRow {
  id: string;
  seed: number;
  outcome: 'pass' | 'fail' | 'escalate';
  mode: 'baseline' | 'trained';
  steps: number;
  notes: string;
}

function buildIllustrativeEpisodes(domain: string): EpisodeRow[] {
  const rows: EpisodeRow[] = [];
  for (let i = 0; i < 24; i++) {
    const seed = 4000 + i * 37;
    const fail = i % 5 === 0;
    const escalate = i % 7 === 0;
    rows.push({
      id: `EP-${String(8000 + i).padStart(4, '0')}`,
      seed,
      outcome: escalate ? 'escalate' : fail ? 'fail' : 'pass',
      mode: i % 2 === 0 ? 'baseline' : 'trained',
      steps: 18 + (i % 9),
      notes:
        escalate
          ? `${domain}: repeated motor failure → escalate`
          : fail
            ? `${domain}: capacity / hazard violation`
            : `${domain}: completed within policy envelope`,
    });
  }
  return rows;
}

export function EpisodesView({ config }: Props) {
  const rows = useMemo(
    () => buildIllustrativeEpisodes(config.meta.domainLabel),
    [config.meta.domainLabel],
  );
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? '');
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];

  return (
    <div className="page-view episodes-view">
      <header className="page-hero">
        <div>
          <h1 className="page-h1">EPISODE REVIEW</h1>
          <p className="page-sub">
            Browse seeded episodes, inspect outcomes, queue re-runs.
          </p>
        </div>
        <SimLabel />
      </header>

      <div className="episodes-layout">
        <div className="episodes-list" role="list">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="listitem"
              className={`episode-row${row.id === selected?.id ? ' active' : ''}`}
              onClick={() => setSelectedId(row.id)}
            >
              <span className="ep-id">{row.id}</span>
              <span className={`ep-outcome ${row.outcome}`}>{row.outcome}</span>
              <span className="ep-meta">
                {row.mode} · {row.steps} steps
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="episode-detail panel-like">
            <div className="detail-kicker">SELECTED EPISODE</div>
            <h2 className="detail-title">{selected.id}</h2>
            <dl className="detail-grid">
              <div>
                <dt>Seed</dt>
                <dd>{selected.seed}</dd>
              </div>
              <div>
                <dt>Policy</dt>
                <dd>{selected.mode}</dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd className={`ep-outcome ${selected.outcome}`}>{selected.outcome}</dd>
              </div>
              <div>
                <dt>Steps</dt>
                <dd>{selected.steps}</dd>
              </div>
            </dl>
            <p className="detail-notes">{selected.notes}</p>
            <div className="detail-actions">
              <button type="button" className="primary" disabled>
                Open in live
              </button>
              <button type="button" disabled>
                Export trace
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
