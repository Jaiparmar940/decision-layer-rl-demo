import type { TaskConfig } from '../types';
import type { ResultsLoadState } from '../hooks/useResultsBatch';
import { DeltaCards } from './results/DeltaCards';
import { DumbbellChart } from './results/DumbbellChart';
import { EpisodeStrip } from './results/EpisodeStrip';
import { SimLabel } from './SimLabel';
import { ScoringPopover } from './ScoringPopover';

interface Props {
  config: TaskConfig;
  load: ResultsLoadState;
}

export function ResultsView({ config, load }: Props) {
  if (load.status === 'idle' || load.status === 'computing') {
    return (
      <div className="results-view results-computing">
        <div className="results-computing-box">
          <div className="results-computing-title">
            computing 1,000 episodes…
          </div>
          <div className="results-computing-sub">
            {config.meta.domainLabel} · fixed seed sequence · baseline + trained
          </div>
          <div className="results-spinner" aria-hidden />
        </div>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="results-view">
        <div className="results-error">RESULTS error: {load.message}</div>
      </div>
    );
  }

  const { data } = load;
  const b = data.baseline;
  const t = data.trained;

  return (
    <div className="results-view">
      <div className="results-hero">
        <div>
          <h1 className="results-h1">RESULTS // 1,000-EPISODE BATCH</h1>
          <div className="results-domain">{config.meta.domainLabel}</div>
        </div>
        <div className="results-throughput">
          <div className="tp-chip">
            <span className="tp-k">WALL</span>
            <span className="tp-v">{data.wallMs.toFixed(0)} ms</span>
          </div>
          <div className="tp-chip accent">
            <span className="tp-k">THROUGHPUT</span>
            <span className="tp-v">
              {data.episodesPerSec.toFixed(0)} eps/s
            </span>
          </div>
          <div className="tp-chip">
            <span className="tp-k">RUNS</span>
            <span className="tp-v">
              {data.episodeCount} × 2 = {data.episodeCount * 2}
            </span>
          </div>
          <ScoringPopover scoring={config.scoring} />
          <SimLabel />
        </div>
      </div>

      <DeltaCards
        composite={{
          baseline: { mean: b.compositeMean, stdev: b.compositeStdev },
          trained: { mean: t.compositeMean, stdev: t.compositeStdev },
        }}
        unflagged={{
          baseline: b.unflaggedIncomplete,
          trained: t.unflaggedIncomplete,
        }}
        recovery={{
          baseline: b.recoverySuccess,
          trained: t.recoverySuccess,
        }}
        safety={{
          baseline: b.repeatedFailureSafety,
          trained: t.repeatedFailureSafety,
        }}
      />

      <DumbbellChart
        mismatch={{
          baseline: b.manifestMismatchCaught,
          trained: t.manifestMismatchCaught,
        }}
        hazard={{
          baseline: b.hazardBaggedEpisodes,
          trained: t.hazardBaggedEpisodes,
        }}
        special={{
          baseline: b.specialMisbagged,
          trained: t.specialMisbagged,
        }}
        capacity={{
          baseline: b.capacityViolated,
          trained: t.capacityViolated,
        }}
        meanSteps={{ baseline: b.meanSteps, trained: t.meanSteps }}
      />

      <EpisodeStrip
        baselineScores={data.baselineScores}
        trainedScores={data.trainedScores}
      />

      <div className="results-footnote mono">
        <p>
          Trained encounters fewer repeated-failure episodes (it repositions
          instead of retrying a failing primitive), then handles all of them —
          denominators differ by design.
        </p>
        <p>
          Policies are scripted illustrations of pre-/post-training behavior.
          The real version is trained on your deployment&apos;s failure data.
        </p>
        <p className="sim-label">simulated — illustrative data</p>
      </div>
    </div>
  );
}
