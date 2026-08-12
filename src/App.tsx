import { useMemo } from 'react';
import { resolveDomain } from './config';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { EnvironmentPanel } from './components/EnvironmentPanel';
import { PlannerPanel } from './components/PlannerPanel';
import { ExecutorPanel } from './components/ExecutorPanel';
import { ScorecardView } from './components/Scorecard';
import { BatchDashboard } from './components/BatchDashboard';
import { useEpisodeRunner } from './hooks/useEpisodeRunner';

export default function App() {
  const config = useMemo(() => resolveDomain(), []);
  const runner = useEpisodeRunner(config);

  return (
    <div className="app">
      <Header
        config={config}
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
            <BatchDashboard result={runner.batch} />
          ) : runner.score ? (
            <ScorecardView
              config={config}
              score={runner.score}
              mode={runner.mode}
            />
          ) : null}
        </div>
      )}

      <Footer config={config} />
    </div>
  );
}
