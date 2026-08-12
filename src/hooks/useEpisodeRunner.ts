import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BatchResult,
  EpisodeState,
  PolicyMode,
  Scorecard,
  TaskConfig,
  TraceLine,
} from '../types';
import { runBatch } from '../engine/batch';
import {
  createInitialState,
  generateEpisodeSeed,
  getAttr,
} from '../engine/episode';
import { createPlannerContext } from '../engine/planner';
import type { PlannerEpisodeContext } from '../engine/planner/types';
import { deriveStreams, randomMasterSeed, type Rng } from '../engine/rng';
import { cloneState, stepOnce } from '../engine/runner';
import { scoreEpisode } from '../engine/score';

export interface RunnerApi {
  config: TaskConfig;
  mode: PolicyMode;
  speed: 1 | 4;
  running: boolean;
  done: boolean;
  state: EpisodeState | null;
  plannerLines: TraceLine[];
  executorLines: TraceLine[];
  score: Scorecard | null;
  batch: BatchResult | null;
  episodeId: string;
  seed: number;
  setMode: (m: PolicyMode) => void;
  setSpeed: (s: 1 | 4) => void;
  newEpisode: () => void;
  skip: () => void;
  runHundred: () => void;
}

interface LiveBundle {
  state: EpisodeState;
  pctx: PlannerEpisodeContext;
  rng: Rng;
  masterSeed: number;
  episodeSerial: number;
}

function finalizeScore(state: EpisodeState, config: TaskConfig): Scorecard {
  const score = scoreEpisode(state, config);
  let hazardBagged = 0;
  let specialMis = false;
  for (const c of state.containers) {
    for (const id of c.itemIds) {
      const item = state.seedData.items.find((i) => i.id === id)!;
      const attr = getAttr(config, item.attributeId);
      if (attr.hazard) hazardBagged += 1;
      if (attr.special) specialMis = true;
    }
  }
  score.hazardBaggedCount = hazardBagged;
  score.specialMisbagged = specialMis;
  return score;
}

export function useEpisodeRunner(config: TaskConfig): RunnerApi {
  const [mode, setModeState] = useState<PolicyMode>('baseline');
  const [speed, setSpeedState] = useState<1 | 4>(1);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [state, setState] = useState<EpisodeState | null>(null);
  const [plannerLines, setPlannerLines] = useState<TraceLine[]>([]);
  const [executorLines, setExecutorLines] = useState<TraceLine[]>([]);
  const [score, setScore] = useState<Scorecard | null>(null);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [episodeId, setEpisodeId] = useState('EP-0000');
  const [seed, setSeed] = useState(0);

  const runIdRef = useRef(0);
  const liveRef = useRef<LiveBundle | null>(null);
  const speedRef = useRef<1 | 4>(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serialRef = useRef(0);
  const modeRef = useRef<PolicyMode>('baseline');

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const finishEpisode = useCallback(
    (st: EpisodeState, runId: number) => {
      if (runId !== runIdRef.current) return;
      clearTimer();
      const sc = finalizeScore(st, config);
      setScore(sc);
      setState(cloneState(st));
      setPlannerLines([...st.plannerLines]);
      setExecutorLines([...st.executorLines]);
      setRunning(false);
      setDone(true);
      liveRef.current = null;
    },
    [config],
  );

  const pump = useCallback(
    (runId: number) => {
      if (runId !== runIdRef.current) return;
      const live = liveRef.current;
      if (!live || live.state.done) {
        if (live?.state) finishEpisode(live.state, runId);
        return;
      }

      stepOnce(live.state, config, live.pctx, live.rng);

      if (runId !== runIdRef.current) return;

      setState(cloneState(live.state));
      setPlannerLines([...live.state.plannerLines]);
      setExecutorLines([...live.state.executorLines]);

      if (live.state.done) {
        finishEpisode(live.state, runId);
        return;
      }

      const delay = config.timing.streamDelayMs / speedRef.current;
      timerRef.current = setTimeout(() => pump(runId), delay);
    },
    [config, finishEpisode],
  );

  const startLive = useCallback(
    (nextMode: PolicyMode, masterSeed?: number) => {
      clearTimer();
      const runId = ++runIdRef.current;
      serialRef.current += 1;
      const serial = serialRef.current;
      const ms = masterSeed ?? randomMasterSeed();
      const streams = deriveStreams(ms);
      const gen = generateEpisodeSeed(config, ms, serial);
      const st = createInitialState(gen.seedData, nextMode, config);
      const rng =
        nextMode === 'baseline'
          ? streams.streamExecutorBaseline
          : streams.streamExecutorTrained;
      const pctx = createPlannerContext(nextMode, config, rng);

      liveRef.current = {
        state: st,
        pctx,
        rng,
        masterSeed: ms,
        episodeSerial: serial,
      };

      modeRef.current = nextMode;
      setBatch(null);
      setScore(null);
      setDone(false);
      setRunning(true);
      setModeState(nextMode);
      setSeed(ms);
      setEpisodeId(gen.seedData.episodeId);
      setState(cloneState(st));
      setPlannerLines([]);
      setExecutorLines([]);

      timerRef.current = setTimeout(() => pump(runId), 0);
    },
    [config, pump],
  );

  const newEpisode = useCallback(() => {
    startLive(modeRef.current);
  }, [startLive]);

  const setMode = useCallback(
    (m: PolicyMode) => {
      startLive(m);
    },
    [startLive],
  );

  const setSpeed = useCallback((s: 1 | 4) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  const skip = useCallback(() => {
    const runId = runIdRef.current;
    clearTimer();
    const live = liveRef.current;
    if (!live) return;

    let guard = 0;
    while (!live.state.done && guard < 500) {
      stepOnce(live.state, config, live.pctx, live.rng);
      guard += 1;
    }
    if (runId !== runIdRef.current) return;
    setPlannerLines([...live.state.plannerLines]);
    setExecutorLines([...live.state.executorLines]);
    finishEpisode(live.state, runId);
  }, [config, finishEpisode]);

  const runHundred = useCallback(() => {
    clearTimer();
    runIdRef.current += 1;
    liveRef.current = null;
    setRunning(false);
    setDone(false);
    setScore(null);
    const result = runBatch(config);
    setBatch(result);
  }, [config]);

  useEffect(() => {
    startLive('baseline');
    return () => {
      clearTimer();
      runIdRef.current += 1;
      liveRef.current = null;
    };
    // mount-only auto-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    config,
    mode,
    speed,
    running,
    done,
    state,
    plannerLines,
    executorLines,
    score,
    batch,
    episodeId,
    seed,
    setMode,
    setSpeed,
    newEpisode,
    skip,
    runHundred,
  };
}
