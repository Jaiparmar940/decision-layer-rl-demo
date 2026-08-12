import type { PolicyMode, TaskConfig } from '../types';
import type { AppView } from '../routing';
import logo from '../assets/snl-logo.png';
import { StatusChip } from './StatusChip';

interface Props {
  config: TaskConfig;
  view: AppView;
  onView: (v: AppView) => void;
  episodeId: string;
  seed: number;
  mode: PolicyMode;
  speed: 1 | 4;
  running: boolean;
  onMode: (m: PolicyMode) => void;
  onSpeed: (s: 1 | 4) => void;
  onSkip: () => void;
  onNew: () => void;
  onBatch: () => void;
}

export function Header({
  config,
  view,
  onView,
  episodeId,
  seed,
  mode,
  speed,
  running,
  onMode,
  onSpeed,
  onSkip,
  onNew,
  onBatch,
}: Props) {
  const live = view === 'live';

  return (
    <header className="header">
      <div className="brand" aria-label="Second Nature Labs">
        <img className="brand-logo" src={logo} alt="" width={32} height={32} />
        <span className="brand-name">Second Nature Labs</span>
      </div>

      <div className="seg view-seg" role="tablist" aria-label="App view">
        <button
          type="button"
          role="tab"
          aria-selected={live}
          className={live ? 'active' : ''}
          onClick={() => onView('live')}
        >
          Live
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!live}
          className={!live ? 'active-green' : ''}
          onClick={() => onView('results')}
        >
          Results
        </button>
      </div>

      <div className="header-meta">
        <div className="header-title">{config.meta.title}</div>
        {live && (
          <StatusChip title="Episode id and RNG seed">
            <strong>
              {episodeId} // SEED {seed}
            </strong>
          </StatusChip>
        )}
        {!live && (
          <StatusChip title="Results batch">
            <strong>1,000 EPS // FIXED SEEDS</strong>
          </StatusChip>
        )}
      </div>

      {live && (
        <div className="header-controls">
          <div className="seg" role="group" aria-label="Policy mode">
            <button
              type="button"
              className={mode === 'baseline' ? 'active' : ''}
              onClick={() => onMode('baseline')}
            >
              Baseline
            </button>
            <button
              type="button"
              className={mode === 'trained' ? 'active-green' : ''}
              onClick={() => onMode('trained')}
            >
              Trained
            </button>
          </div>
          <div className="seg" role="group" aria-label="Stream speed">
            <button
              type="button"
              className={speed === 1 ? 'active' : ''}
              onClick={() => onSpeed(1)}
            >
              1x
            </button>
            <button
              type="button"
              className={speed === 4 ? 'active' : ''}
              onClick={() => onSpeed(4)}
            >
              4x
            </button>
          </div>
          <button type="button" onClick={onSkip} disabled={!running}>
            Skip
          </button>
          <button type="button" className="primary" onClick={onNew}>
            New episode
          </button>
          <button type="button" onClick={onBatch}>
            Run {config.batch.episodes}
          </button>
        </div>
      )}
    </header>
  );
}
