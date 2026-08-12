import type { PolicyMode, TaskConfig } from '../types';
import { StatusChip } from './StatusChip';

interface Props {
  config: TaskConfig;
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
  return (
    <header className="header">
      <div className="header-title">{config.meta.title}</div>
      <StatusChip title="Episode id and RNG seed">
        <strong>
          {episodeId} // SEED {seed}
        </strong>
      </StatusChip>
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
    </header>
  );
}
