import type { BatchResult, MeasuredRunResult, MetricValue, PolicyMetrics, ScoringConfig } from '../types';
import { formatMetric } from '../engine/metrics';
import { CompositeNumeral } from './CompositeNumeral';
import { ScoringPopover } from './ScoringPopover';
import { DEFAULT_SCORING } from '../config/scoring';
import { MeasuredLabel } from './MeasuredLabel';
import { SimLabel } from './SimLabel';

interface Props {
  result: BatchResult;
  measured?: MeasuredRunResult[] | null;
  scoring?: ScoringConfig;
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
      return mv && typeof mv === 'object' && 'denominator' in mv && mv.denominator > 0;
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
        if (!mv || typeof mv !== 'object' || !('rate' in mv)) return null;
        return (
          <div key={run.modelId + run.date} className="metric-detail measured-detail">
            MEASURED — {run.modelShortName}, {run.episodeCount} eps — {formatMetric(mv)}
          </div>
        );
      })}
      {(measured ?? []).length > 0 ? <MeasuredLabel /> : null}
      {allZero ? (
        <div className="bar-na">n/a (0 episodes — not scored; inaction ≠ virtue)</div>
      ) : (
        <div className="bars">
          <BarTrack label="BASELINE" pct={bPct} variant="baseline" />
          <BarTrack label="TRAINED" pct={tPct} variant="trained" />
          {(measured ?? []).map((run) => {
            const key = metricKeyFromLabel(baseline.label);
            const mv = key ? run.metrics[key] : undefined;
            if (!mv || typeof mv !== 'object' || !('rate' in mv)) return null;
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
  | 'taskCompleted'
  | 'itemsResolved'
  | 'stepsExhausted'
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
    'Task completed': 'taskCompleted',
    'Items resolved (legitimate terminal)': 'itemsResolved',
    'Step cap hit': 'stepsExhausted',
  };
  return map[label] ?? null;
}

function policyComposite(m: PolicyMetrics) {
  return {
    total: Math.round(m.compositeMean),
    components: m.compositeComponents,
  };
}

export function BatchDashboard({ result, measured, scoring = DEFAULT_SCORING }: Props) {
  const { baseline: b, trained: t } = result;
  const runs = measured ?? [];
  const bIncomplete = (b.taskCompleted.numerator ?? 0) === 0 && b.episodes > 0;
  const tIncomplete = (t.taskCompleted.numerator ?? 0) === 0 && t.episodes > 0;

  return (
    <div className="batch-dash">
      <h2>
        BATCH EVAL // BASELINE VS TRAINED
        {runs.length > 0 ? ' VS MEASURED' : ''}
        <ScoringPopover scoring={scoring} />
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

      <div className="composite-row">
        <div className={`composite-card${bIncomplete ? ' incomplete' : ''}`}>
          {bIncomplete ? <div className="incomplete-banner">INCOMPLETE</div> : null}
          <CompositeNumeral
            value={policyComposite(b)}
            label={`BASELINE · ${b.compositeMean.toFixed(1)} ± ${b.compositeStdev.toFixed(1)}`}
            size="md"
          />
        </div>
        <div className={`composite-card${tIncomplete ? ' incomplete' : ''}`}>
          {tIncomplete ? <div className="incomplete-banner">INCOMPLETE</div> : null}
          <CompositeNumeral
            value={policyComposite(t)}
            label={`TRAINED · ${t.compositeMean.toFixed(1)} ± ${t.compositeStdev.toFixed(1)}`}
            size="md"
          />
        </div>
        {runs.map((r) => {
          const inc =
            (r.metrics.taskCompleted?.numerator ?? 0) === 0 && r.episodeCount > 0;
          const hasComposite = typeof r.metrics.compositeMean === 'number';
          if (!hasComposite) return null;
          return (
            <div
              key={r.modelId + '-comp'}
              className={`composite-card measured${inc ? ' incomplete' : ''}`}
            >
              {inc ? <div className="incomplete-banner">INCOMPLETE</div> : null}
              <CompositeNumeral
                value={policyComposite(r.metrics)}
                label={`M:${r.modelShortName} · ${r.metrics.compositeMean.toFixed(1)} ± ${r.metrics.compositeStdev.toFixed(1)}`}
                size="md"
              />
            </div>
          );
        })}
      </div>

      <MetricBlock
        label="Task completed (higher better)"
        baseline={b.taskCompleted}
        trained={t.taskCompleted}
        measured={runs}
      />
      <MetricBlock
        label="Items resolved (legitimate terminal) (higher better)"
        baseline={b.itemsResolved}
        trained={t.itemsResolved}
        measured={runs}
      />
      <MetricBlock
        label="Step cap hit (lower better)"
        baseline={b.stepsExhausted}
        trained={t.stepsExhausted}
        measured={runs}
        invertGood
      />
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
