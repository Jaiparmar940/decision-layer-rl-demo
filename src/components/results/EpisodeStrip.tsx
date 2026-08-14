import type { Scorecard } from '../../types';
import {
  classifyEpisodeCell,
  type EpisodeCellKind,
} from '../../engine/episodeCell';
import { SimLabel } from '../SimLabel';

const COLS = 50;
const ROWS = 20;

interface GridProps {
  label: string;
  scores: Scorecard[];
  variant: 'baseline' | 'trained';
}

function EpisodeGrid({ label, scores, variant }: GridProps) {
  const cells: EpisodeCellKind[] = scores.map(classifyEpisodeCell);
  // Pad/truncate to 1000
  while (cells.length < COLS * ROWS) cells.push('clean');
  const slice = cells.slice(0, COLS * ROWS);

  return (
    <div className={`episode-grid-block ${variant}`}>
      <div className="episode-grid-label">{label}</div>
      <div
        className="episode-grid"
        style={{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        }}
        role="img"
        aria-label={`${label}: ${slice.filter((c) => c === 'clean').length} clean, ${slice.filter((c) => c === 'minor').length} minor, ${slice.filter((c) => c === 'unflagged').length} unflagged, ${slice.filter((c) => c === 'incomplete').length} incomplete`}
      >
        {slice.map((kind, i) => (
          <span
            key={i}
            className={`ep-cell ep-${kind}`}
            title={`EP-${String(i + 1).padStart(4, '0')} · ${kind}`}
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  baselineScores: Scorecard[];
  trainedScores: Scorecard[];
}

export function EpisodeStrip({ baselineScores, trainedScores }: Props) {
  return (
    <div className="episode-strip">
      <div className="results-section-h">
        EPISODE STRIP — 1,000 EPISODES × 2 POLICIES
      </div>
      <p className="episode-strip-note">
        Same seed order row-for-row. Speckled = failures; trained should read
        mostly clean with residual imperfections.
      </p>
      <div className="episode-grids">
        <EpisodeGrid
          label="BASELINE"
          scores={baselineScores}
          variant="baseline"
        />
        <EpisodeGrid
          label="TRAINED"
          scores={trainedScores}
          variant="trained"
        />
      </div>
      <div className="episode-legend">
        <span>
          <i className="ep-cell ep-clean" /> clean
        </span>
        <span>
          <i className="ep-cell ep-minor" /> minor issue
        </span>
        <span>
          <i className="ep-cell ep-unflagged" /> unflagged incomplete
        </span>
        <span>
          <i className="ep-cell ep-incomplete" /> incomplete
        </span>
        <SimLabel />
      </div>
    </div>
  );
}
