import type { BatchResult, MetricValue } from '../types';
import { formatMetric } from '../engine/metrics';
import { SimLabel } from './SimLabel';

interface Props {
  result: BatchResult;
}

function BarPair({
  label,
  baseline,
  trained,
  invertGood,
}: {
  label: string;
  baseline: MetricValue;
  trained: MetricValue;
  /** If true, higher is worse (show as failure rate visually) */
  invertGood?: boolean;
}) {
  void invertGood;
  const bPct = baseline.rate == null ? null : Math.round(baseline.rate * 100);
  const tPct = trained.rate == null ? null : Math.round(trained.rate * 100);

  return (
    <div className="metric-row">
      <div className="metric-label">{label}</div>
      <div className="metric-detail">
        BASELINE — {formatMetric(baseline)}
      </div>
      <div className="metric-detail">
        TRAINED — {formatMetric(trained)}
      </div>
      <SimLabel />
      {baseline.denominator === 0 && trained.denominator === 0 ? (
        <div className="bar-na">n/a (0 episodes)</div>
      ) : (
        <div className="bars">
          <div className="bar-track">
            <span>BASELINE</span>
            <div className="bar-fill-wrap">
              {bPct == null ? null : (
                <div className="bar-fill baseline" style={{ width: `${bPct}%` }} />
              )}
            </div>
            <span>{bPct == null ? 'n/a' : `${bPct}%`}</span>
          </div>
          <div className="bar-track">
            <span>TRAINED</span>
            <div className="bar-fill-wrap">
              {tPct == null ? null : (
                <div className="bar-fill trained" style={{ width: `${tPct}%` }} />
              )}
            </div>
            <span>{tPct == null ? 'n/a' : `${tPct}%`}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function BatchDashboard({ result }: Props) {
  const { baseline: b, trained: t } = result;

  return (
    <div className="batch-dash">
      <h2>BATCH EVAL // BASELINE VS TRAINED</h2>
      <div className="batch-meta">
        <span className="chip">
          <strong>{result.episodeCount}</strong> episodes × 2 policies
        </span>
        <span className="chip">
          <strong>{result.episodesPerSec.toFixed(0)}</strong> episodes/sec
        </span>
        <span className="chip">
          wall <strong>{result.wallMs.toFixed(1)}ms</strong>
        </span>
        <SimLabel />
      </div>

      <BarPair
        label="Manifest mismatch caught (higher better)"
        baseline={b.manifestMismatchCaught}
        trained={t.manifestMismatchCaught}
      />
      <BarPair
        label="Episodes with hazard item containerized (lower better)"
        baseline={b.hazardBaggedEpisodes}
        trained={t.hazardBaggedEpisodes}
        invertGood
      />
      <BarPair
        label="Special item mis-containerized (lower better)"
        baseline={b.specialMisbagged}
        trained={t.specialMisbagged}
        invertGood
      />
      <BarPair
        label="Capacity violated (lower better)"
        baseline={b.capacityViolated}
        trained={t.capacityViolated}
        invertGood
      />
      <BarPair
        label="Recovery success after executor failure (higher better)"
        baseline={b.recoverySuccess}
        trained={t.recoverySuccess}
      />
      <BarPair
        label="Incomplete item containerized without flag (lower better)"
        baseline={b.unflaggedIncomplete}
        trained={t.unflaggedIncomplete}
        invertGood
      />
      <BarPair
        label="Repeated-failure episodes handled safely (higher better)"
        baseline={b.repeatedFailureSafety}
        trained={t.repeatedFailureSafety}
      />

      <div className="metric-row">
        <div className="metric-label">Mean steps / episode</div>
        <div className="metric-detail">
          BASELINE — {b.meanSteps.toFixed(1)} steps / {b.episodes} episodes
        </div>
        <div className="metric-detail">
          TRAINED — {t.meanSteps.toFixed(1)} steps / {t.episodes} episodes
        </div>
        <SimLabel />
        <div className="bars">
          <div className="bar-track">
            <span>BASELINE</span>
            <div className="bar-fill-wrap">
              <div
                className="bar-fill baseline"
                style={{
                  width: `${Math.min(100, (b.meanSteps / 80) * 100)}%`,
                }}
              />
            </div>
            <span>{b.meanSteps.toFixed(1)}</span>
          </div>
          <div className="bar-track">
            <span>TRAINED</span>
            <div className="bar-fill-wrap">
              <div
                className="bar-fill trained"
                style={{
                  width: `${Math.min(100, (t.meanSteps / 80) * 100)}%`,
                }}
              />
            </div>
            <span>{t.meanSteps.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
