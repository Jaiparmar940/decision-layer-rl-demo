import type { PolicyMode, TaskConfig } from '../types';
import type { AppView } from '../routing';
import logo from '../assets/snl-logo.png';
import { StatusChip } from './StatusChip';

interface Props {
  config: TaskConfig;
  view: AppView;
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

const VIEW_CHIP: Partial<Record<AppView, string>> = {
  results: '1,000 EPS // FIXED SEEDS',
  episodes: 'EPISODE LIBRARY',
  evals: 'MODEL COMPARISON',
  curves: 'LEARNING CURVES',
  models: 'REGISTRY // LOCAL KEYS',
  manual: 'MANUAL RUN // SAME EVAL PATH',
};

export function Header({
  config,
  view,
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
      <a
        className="brand"
        href="https://snlabs.dev/"
        aria-label="Second Nature Labs"
      >
        <img className="brand-logo" src={logo} alt="" width={32} height={32} />
        <span className="brand-name">Second Nature Labs</span>
      </a>
      <button
        type="button"
        className="demo-badge"
        aria-describedby="demo-badge-tip"
      >
        DEMO
        <span id="demo-badge-tip" role="tooltip" className="demo-badge-tip">
          Sample data and a mock algorithm. Real training is not taking place.
        </span>
      </button>

      <div className="header-meta">
        <div className="header-title">{config.meta.title}</div>
        {live ? (
          <>
            <StatusChip title="Episode id and RNG seed">
              <strong>
                {episodeId} // SEED {seed} // {mode.toUpperCase()}
              </strong>
            </StatusChip>
          </>
        ) : (
          <StatusChip title="Current view">
            <strong>{VIEW_CHIP[view] ?? view.toUpperCase()}</strong>
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
