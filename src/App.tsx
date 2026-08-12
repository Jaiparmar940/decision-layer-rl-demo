import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveDomain } from './config';
import { resolveView, setViewInUrl, type AppView } from './routing';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { EnvironmentPanel } from './components/EnvironmentPanel';
import { PlannerPanel } from './components/PlannerPanel';
import { ExecutorPanel } from './components/ExecutorPanel';
import { ScorecardView } from './components/Scorecard';
import { BatchDashboard } from './components/BatchDashboard';
import { ResultsView } from './components/ResultsView';
import { useEpisodeRunner } from './hooks/useEpisodeRunner';
import { useResultsBatch } from './hooks/useResultsBatch';
import { loadMeasuredResults } from './measured/loadMeasured';
import type { MeasuredRunResult } from './types';

export default function App() {
  const config = useMemo(() => resolveDomain(), []);
  const [view, setViewState] = useState<AppView>(() => resolveView());
  const runner = useEpisodeRunner(config);
  const [measured, setMeasured] = useState<MeasuredRunResult[] | null>(null);
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
    <div className={`app view-${view}`}>
      <Header
        config={config}
        view={view}
        onView={setView}
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

      {view === 'results' ? (
        <ResultsView config={config} load={resultsLoad} />
      ) : (
        <>
          <main className="main">
            <EnvironmentPanel
              config={config}
              state={runner.state}
              revealActual={runner.done}
            />
            <PlannerPanel config={config} lines={runner.plannerLines} />
            <ExecutorPanel config={config} lines={runner.executorLines} />
          </main>

          {(runner.score || runner.batch) && (
            <div className="lower">
              {runner.batch ? (
                <BatchDashboard result={runner.batch} measured={measured} />
              ) : runner.score ? (
                <ScorecardView
                  config={config}
                  score={runner.score}
                  mode={runner.mode}
                />
              ) : null}
            </div>
          )}
        </>
      )}

      <Footer config={config} />
    </div>
  );
}
