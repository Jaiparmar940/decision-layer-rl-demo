import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveDomain } from './config';
import {
  resolveEmbedded,
  resolveView,
  setDomainInUrl,
  setViewInUrl,
  type AppView,
} from './routing';
import { ManualRunView } from './components/ManualRunView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { EnvironmentPanel } from './components/EnvironmentPanel';
import { PlannerPanel } from './components/PlannerPanel';
import { ExecutorPanel } from './components/ExecutorPanel';
import { LiveScorecardBar } from './components/Scorecard';
import { BatchDashboard } from './components/BatchDashboard';
import { ResultsView } from './components/ResultsView';
import { EpisodesView } from './components/EpisodesView';
import { EvalsView } from './components/EvalsView';
import { CurvesView } from './components/CurvesView';
import { ModelsView } from './components/ModelsView';
import { useEpisodeRunner } from './hooks/useEpisodeRunner';
import { useResultsBatch } from './hooks/useResultsBatch';
import { loadMeasuredResults } from './measured/loadMeasured';
import type { MeasuredRunResult } from './types';

type LivePanel = 'environment' | 'planner' | 'executor';

export default function App() {
  const [domainId, setDomainId] = useState(() => resolveDomain().meta.id);
  const config = useMemo(() => resolveDomain(`?domain=${domainId}`), [domainId]);
  const [view, setViewState] = useState<AppView>(() => resolveView());
  const runner = useEpisodeRunner(config);
  const [measured, setMeasured] = useState<MeasuredRunResult[] | null>(null);
  const [livePanel, setLivePanel] = useState<LivePanel>('environment');
  const embedded = useMemo(() => resolveEmbedded(), []);
  const resultsLoad = useResultsBatch(view === 'results', config);

  const setView = useCallback((v: AppView) => {
    setViewState(v);
    setViewInUrl(v);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMeasuredResults(config.meta.id).then((rows) => {
      if (!cancelled) setMeasured(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [config.meta.id]);

  return (
    <div className={`app-shell view-${view} ${embedded ? 'is-embedded' : 'is-standalone'}`}>
      <Header
        config={config}
        view={view}
        episodeId={runner.episodeId}
        seed={runner.seed}
        mode={runner.mode}
        speed={runner.speed}
        running={runner.running}
        onMode={runner.setMode}
        onSpeed={runner.setSpeed}
        onSkip={runner.skip}
        onNew={runner.newEpisode}
        onBatch={runner.runHundred}
      />

      <div className="app-main">
        <Sidebar view={view} onView={setView} />
        <div className="app-body">
          {view === 'results' ? (
            <ResultsView config={config} load={resultsLoad} />
          ) : view === 'manual' ? (
            <ManualRunView
              key={domainId}
              domainId={domainId}
              onDomain={(id) => {
                setDomainId(id);
                setDomainInUrl(id);
              }}
            />
          ) : view === 'episodes' ? (
            <EpisodesView config={config} />
          ) : view === 'evals' ? (
            <EvalsView config={config} measured={measured} />
          ) : view === 'curves' ? (
            <CurvesView config={config} />
          ) : view === 'models' ? (
            <ModelsView />
          ) : (
            <>
              {!embedded && (
                <div className="live-panel-tabs" role="tablist" aria-label="Live view panel">
                  {(['environment', 'planner', 'executor'] as const).map((panel) => (
                    <button
                      key={panel}
                      type="button"
                      role="tab"
                      aria-selected={livePanel === panel}
                      aria-controls={`live-panel-${panel}`}
                      className={livePanel === panel ? 'active' : ''}
                      onClick={() => setLivePanel(panel)}
                    >
                      {panel}
                    </button>
                  ))}
                </div>
              )}

              <main className={`main${embedded ? '' : ` mobile-panel-${livePanel}`}`}>
                <EnvironmentPanel
                  config={config}
                  state={runner.state}
                  revealActual={runner.done}
                />
                <PlannerPanel config={config} lines={runner.plannerLines} />
                <ExecutorPanel config={config} lines={runner.executorLines} />
              </main>

              <div className="lower">
                {runner.batch ? (
                  <BatchDashboard
                    result={runner.batch}
                    measured={measured}
                    scoring={config.scoring}
                  />
                ) : (
                  <LiveScorecardBar
                    config={config}
                    score={runner.score}
                    mode={runner.mode}
                  />
                )}
              </div>
            </>
          )}

          <Footer config={config} />
        </div>
      </div>
    </div>
  );
}
