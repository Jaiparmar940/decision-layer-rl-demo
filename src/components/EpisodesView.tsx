import type { TaskConfig } from '../types';
import { useMemo, useState } from 'react';
import { SimLabel } from './SimLabel';
import { CompositeNumeral } from './CompositeNumeral';
import { ScoringPopover } from './ScoringPopover';
import {
  parseTranscriptJson,
  type EpisodeTranscript,
} from '../engine/transcript';
import { compositeScore } from '../engine/composite';
import { scoringOf } from '../config/scoring';

interface Props {
  config: TaskConfig;
}

interface EpisodeRow {
  id: string;
  seed: number;
  outcome: 'pass' | 'fail' | 'escalate' | 'incomplete';
  mode: 'baseline' | 'trained';
  steps: number;
  composite: number;
  notes: string;
}

function buildIllustrativeEpisodes(domain: string): EpisodeRow[] {
  const rows: EpisodeRow[] = [];
  for (let i = 0; i < 24; i++) {
    const seed = 4000 + i * 37;
    const incomplete = i % 11 === 0;
    const fail = !incomplete && i % 5 === 0;
    const escalate = !incomplete && !fail && i % 7 === 0;
    const outcome: EpisodeRow['outcome'] = incomplete
      ? 'incomplete'
      : escalate
        ? 'escalate'
        : fail
          ? 'fail'
          : 'pass';
    const composite =
      outcome === 'pass' ? 92 - (i % 5) : outcome === 'escalate' ? 71 - (i % 4) : outcome === 'fail' ? 44 - (i % 8) : 9;
    rows.push({
      id: `EP-${String(8000 + i).padStart(4, '0')}`,
      seed,
      outcome,
      mode: i % 2 === 0 ? 'baseline' : 'trained',
      steps: outcome === 'incomplete' ? 60 : 18 + (i % 9),
      composite,
      notes:
        outcome === 'incomplete'
          ? `${domain}: step cap / abandonment — taskCompleted false`
          : outcome === 'escalate'
            ? `${domain}: repeated motor failure → escalate`
            : outcome === 'fail'
              ? `${domain}: capacity / hazard violation`
              : `${domain}: completed within policy envelope`,
    });
  }
  return rows;
}

export function EpisodesView({ config }: Props) {
  const scoring = scoringOf(config);
  const rows = useMemo(
    () => buildIllustrativeEpisodes(config.meta.domainLabel),
    [config.meta.domainLabel],
  );
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? '');
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  const [loaded, setLoaded] = useState<EpisodeTranscript | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadedComposite =
    loaded?.scorecard != null ? compositeScore(loaded.scorecard, scoring) : null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setLoadError(null);
    try {
      const text = await file.text();
      if (file.name.endsWith('.md')) {
        setLoadError('Load the .transcript.json (markdown is display-only)');
        return;
      }
      const parsed = parseTranscriptJson(JSON.parse(text) as unknown);
      if (!parsed) {
        setLoadError('Not a v1 episode transcript');
        return;
      }
      setLoaded(parsed);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'failed to parse');
    }
  };

  return (
    <div className="page-view episodes-view">
      <header className="page-hero">
        <div>
          <h1 className="page-h1">EPISODE REVIEW</h1>
          <p className="page-sub">
            Browse seeded episodes, or load a manual/LLM .transcript.json.
          </p>
        </div>
        <label className="file-load">
          Load transcript
          <input
            type="file"
            accept=".json,.md,application/json"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <ScoringPopover scoring={scoring} />
        <SimLabel />
      </header>
      {loadError && <p className="manual-error">{loadError}</p>}
      {loaded && (
        <div
          className={`panel-like transcript-loaded${loaded.scorecard && !loaded.scorecard.taskCompleted ? ' incomplete' : ''}`}
        >
          {loaded.scorecard && !loaded.scorecard.taskCompleted ? (
            <div className="incomplete-banner">INCOMPLETE</div>
          ) : null}
          <div className="detail-kicker">LOADED TRANSCRIPT</div>
          <h2 className="detail-title">
            {loaded.episodeId} · {loaded.domain} · seed {loaded.masterSeed}
          </h2>
          <p>
            source {loaded.source}
            {loaded.presetId ? ` / ${loaded.presetId}` : ''} · ended {loaded.endedBy} ·{' '}
            {loaded.steps.length} recorded steps
          </p>
          {loadedComposite ? (
            <CompositeNumeral
              value={loadedComposite}
              incomplete={loaded.scorecard ? !loaded.scorecard.taskCompleted : false}
              size="md"
            />
          ) : null}
          <ol className="action-history">
            {loaded.steps.map((s) => (
              <li key={s.index}>
                <span className="hist-step">{s.outcome?.step ?? s.index + 1}</span>
                <span>
                  {s.action.action}
                  {s.action.itemId ? ` ${s.action.itemId}` : ''}
                </span>
                <span>{s.outcome?.success === false ? 'fail' : 'ok'}</span>
              </li>
            ))}
          </ol>
          {loaded.scorecard && (
            <pre className="payload-pre">
              {JSON.stringify(loaded.scorecard, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="episodes-layout">
        <div className="episodes-list" role="list">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="listitem"
              className={`episode-row${row.id === selected?.id ? ' active' : ''}${row.outcome === 'incomplete' ? ' incomplete' : ''}`}
              onClick={() => setSelectedId(row.id)}
            >
              <span className="ep-id">{row.id}</span>
              <span className={`ep-outcome ${row.outcome}`}>{row.outcome}</span>
              <span className="ep-meta">
                {row.mode} · {row.composite} · {row.steps} steps
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <div
            className={`episode-detail panel-like${selected.outcome === 'incomplete' ? ' incomplete' : ''}`}
          >
            {selected.outcome === 'incomplete' ? (
              <div className="incomplete-banner">INCOMPLETE</div>
            ) : null}
            <div className="detail-kicker">SELECTED EPISODE</div>
            <h2 className="detail-title">{selected.id}</h2>
            <div className="composite-inline">
              <span className="composite-big md">{selected.composite}</span>
              <span className="hint">illustrative composite</span>
            </div>
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
              <div>
                <dt>Composite</dt>
                <dd>{selected.composite}</dd>
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
