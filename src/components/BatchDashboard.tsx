import type { BatchResult, MeasuredRunResult, MetricValue } from '../types';
import { formatMetric } from '../engine/metrics';
import { MeasuredLabel } from './MeasuredLabel';
import { SimLabel } from './SimLabel';

interface Props {
  result: BatchResult;
  measured?: MeasuredRunResult[] | null;
}

function pctOf(m: MetricValue): number | null {
  return m.rate == null ? null : Math.round(m.rate * 100);
}

function BarTrack({
  label,
  pct,
  variant,
  valueLabel,
}: {
  label: string;
  pct: number | null;
  variant: 'baseline' | 'trained' | 'measured';
  valueLabel?: string;
}) {
  return (
    <div className="bar-track">
      <span className="bar-name" title={label}>
        {label}
      </span>
      <div className="bar-fill-wrap">
        {pct == null ? null : (
          <div className={`bar-fill ${variant}`} style={{ width: `${pct}%` }} />
        )}
      </div>
      <span>{valueLabel ?? (pct == null ? 'n/a' : `${pct}%`)}</span>
    </div>
  );
}

function MetricBlock({
  label,
  baseline,
  trained,
  measured,
  invertGood,
}: {
  label: string;
  baseline: MetricValue;
  trained: MetricValue;
  measured?: MeasuredRunResult[];
  invertGood?: boolean;
}) {
  void invertGood;
  const bPct = pctOf(baseline);
  const tPct = pctOf(trained);
  const allZero =
    baseline.denominator === 0 &&
    trained.denominator === 0 &&
    !(measured ?? []).some((m) => {
      const key = metricKeyFromLabel(baseline.label);
      const mv = key ? m.metrics[key] : null;
      return mv && mv.denominator > 0;
    });

  return (
    <div className="metric-row">
      <div className="metric-label">{label}</div>
      <div className="metric-detail">BASELINE — {formatMetric(baseline)}</div>
      <div className="metric-detail">TRAINED — {formatMetric(trained)}</div>
      <SimLabel />
      {(measured ?? []).map((run) => {
        const key = metricKeyFromLabel(baseline.label);
        const mv = key ? run.metrics[key] : undefined;
        if (!mv) return null;
        return (
          <div key={run.modelId + run.date} className="metric-detail measured-detail">
            MEASURED — {run.modelShortName}, {run.episodeCount} eps — {formatMetric(mv)}
          </div>
        );
      })}
      {(measured ?? []).length > 0 ? <MeasuredLabel /> : null}
      {allZero ? (
        <div className="bar-na">n/a (0 episodes)</div>
      ) : (
        <div className="bars">
          <BarTrack label="BASELINE" pct={bPct} variant="baseline" />
          <BarTrack label="TRAINED" pct={tPct} variant="trained" />
          {(measured ?? []).map((run) => {
            const key = metricKeyFromLabel(baseline.label);
            const mv = key ? run.metrics[key] : undefined;
            if (!mv) return null;
            return (
              <BarTrack
                key={run.modelId + '-bar-' + baseline.label}
                label={`M:${run.modelShortName}`}
                pct={pctOf(mv)}
                variant="measured"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

type MetricKey = keyof Pick<
  BatchResult['baseline'],
  | 'manifestMismatchCaught'
  | 'hazardBaggedEpisodes'
  | 'specialMisbagged'
  | 'capacityViolated'
  | 'recoverySuccess'
  | 'unflaggedIncomplete'
  | 'repeatedFailureSafety'
>;

function metricKeyFromLabel(label: string): MetricKey | null {
  const map: Record<string, MetricKey> = {
    'Ticket/manifest mismatch caught': 'manifestMismatchCaught',
    'Episodes with hazard item containerized': 'hazardBaggedEpisodes',
    'Special/house item mis-containerized': 'specialMisbagged',
    'Capacity violated': 'capacityViolated',
    'Recovery success': 'recoverySuccess',
    'Incomplete item containerized without flag': 'unflaggedIncomplete',
    'Repeated-failure episodes handled safely': 'repeatedFailureSafety',
  };
  return map[label] ?? null;
}

export function BatchDashboard({ result, measured }: Props) {
  const { baseline: b, trained: t } = result;
  const runs = measured ?? [];

  return (
    <div className="batch-dash">
      <h2>
        BATCH EVAL // BASELINE VS TRAINED
        {runs.length > 0 ? ' VS MEASURED' : ''}
      </h2>
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
        {runs.map((r) => (
          <span key={r.modelId + r.date} className="chip chip-measured">
            MEASURED — <strong>{r.modelShortName}</strong>, {r.episodeCount} eps
          </span>
        ))}
        {runs.length > 0 ? <MeasuredLabel /> : null}
      </div>

      <MetricBlock
        label="Manifest mismatch caught (higher better)"
        baseline={b.manifestMismatchCaught}
        trained={t.manifestMismatchCaught}
        measured={runs}
      />
      <MetricBlock
        label="Episodes with hazard item containerized (lower better)"
        baseline={b.hazardBaggedEpisodes}
        trained={t.hazardBaggedEpisodes}
        measured={runs}
        invertGood
      />
      <MetricBlock
        label="Special item mis-containerized (lower better)"
        baseline={b.specialMisbagged}
        trained={t.specialMisbagged}
        measured={runs}
        invertGood
      />
      <MetricBlock
        label="Capacity violated (lower better)"
        baseline={b.capacityViolated}
        trained={t.capacityViolated}
        measured={runs}
        invertGood
      />
      <MetricBlock
        label="Recovery success after executor failure (higher better)"
        baseline={b.recoverySuccess}
        trained={t.recoverySuccess}
        measured={runs}
      />
      <MetricBlock
        label="Incomplete item containerized without flag (lower better)"
        baseline={b.unflaggedIncomplete}
        trained={t.unflaggedIncomplete}
        measured={runs}
        invertGood
      />
      <MetricBlock
        label="Repeated-failure episodes handled safely (higher better)"
        baseline={b.repeatedFailureSafety}
        trained={t.repeatedFailureSafety}
        measured={runs}
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
        {runs.map((r) => (
          <div key={r.modelId + '-steps'} className="metric-detail measured-detail">
            MEASURED — {r.modelShortName}, {r.episodeCount} eps —{' '}
            {r.meanSteps.toFixed(1)} steps
            {r.meanTokensPerEpisode > 0
              ? ` · ~${Math.round(r.meanTokensPerEpisode)} tok/ep`
              : ''}
            {r.totalCostEstimate > 0
              ? ` · ~$${r.totalCostEstimate.toFixed(4)}`
              : ''}
          </div>
        ))}
        {runs.length > 0 ? <MeasuredLabel /> : null}
        <div className="bars">
          <BarTrack
            label="BASELINE"
            pct={Math.min(100, (b.meanSteps / 80) * 100)}
            variant="baseline"
            valueLabel={b.meanSteps.toFixed(1)}
          />
          <BarTrack
            label="TRAINED"
            pct={Math.min(100, (t.meanSteps / 80) * 100)}
            variant="trained"
            valueLabel={t.meanSteps.toFixed(1)}
          />
          {runs.map((r) => (
            <BarTrack
              key={r.modelId + '-steps-bar'}
              label={`M:${r.modelShortName}`}
              pct={Math.min(100, (r.meanSteps / 80) * 100)}
              variant="measured"
              valueLabel={r.meanSteps.toFixed(1)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
