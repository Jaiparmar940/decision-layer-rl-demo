import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EpisodeState, TaskConfig } from '../types';
import { createInitialState, generateEpisodeSeed } from '../engine/episode';
import { deriveLlmExecutorStream, randomMasterSeed, type Rng } from '../engine/rng';
import { LLM_MAX_STEPS } from '../engine/runner';
import { scoreEpisode } from '../engine/score';
import {
  applyManualDraft,
  MANUAL_EXECUTOR_SALT,
} from '../engine/manual/apply';
import { buildGraderEvidence, type GraderEvidence } from '../engine/manual/evidence';
import {
  formatPlannerUserMessage,
  serializePlannerView,
  type SerializedPlannerView,
} from '../engine/planner/serialize';
import type { LlmActionJson } from '../engine/planner/llm';
import {
  transcriptEndedBy,
  transcriptToMarkdown,
  type EpisodeTranscript,
  type TranscriptStep,
} from '../engine/transcript';
import type { PresetFixture } from '../engine/presets';

export interface ManualRunner {
  config: TaskConfig;
  state: EpisodeState;
  seed: number;
  maxSteps: number;
  payloadText: string;
  payload: SerializedPlannerView;
  steps: TranscriptStep[];
  evidence: GraderEvidence | null;
  transcript: EpisodeTranscript;
  presetCursor: number | null;
  presetPlaying: boolean;
  newEpisode: (seed?: number | null) => void;
  setMaxSteps: (n: number) => void;
  submit: (draft: LlmActionJson) => string | null;
  playPreset: (fixture: PresetFixture) => void;
  stopPreset: () => void;
  download: () => void;
}

function freshEpisode(config: TaskConfig, masterSeed: number) {
  const { seedData } = generateEpisodeSeed(config, masterSeed, 1);
  const state = createInitialState(seedData, 'llm', config);
  const rng = deriveLlmExecutorStream(masterSeed, MANUAL_EXECUTOR_SALT);
  return { state, rng, seedData };
}

export function useManualRunner(config: TaskConfig): ManualRunner {
  const rngRef = useRef<Rng>(() => 0.5);
  const configRef = useRef(config);
  configRef.current = config;
  const stateRef = useRef<EpisodeState>(null as unknown as EpisodeState);

  const [seed, setSeed] = useState(() => randomMasterSeed());
  const [maxSteps, setMaxStepsState] = useState(LLM_MAX_STEPS);
  const [state, setState] = useState<EpisodeState>(() => {
    const ep = freshEpisode(config, seed);
    rngRef.current = ep.rng;
    stateRef.current = ep.state;
    return ep.state;
  });
  const [steps, setSteps] = useState<TranscriptStep[]>([]);
  const [presetCursor, setPresetCursor] = useState<number | null>(null);
  const [presetPlaying, setPresetPlaying] = useState(false);
  const presetTimer = useRef<number | null>(null);
  const presetQueue = useRef<LlmActionJson[]>([]);
  const maxStepsRef = useRef(maxSteps);
  maxStepsRef.current = maxSteps;

  const resetTo = useCallback((masterSeed: number, cap: number) => {
    const ep = freshEpisode(configRef.current, masterSeed);
    rngRef.current = ep.rng;
    stateRef.current = ep.state;
    setSeed(masterSeed);
    setState(ep.state);
    setSteps([]);
    setPresetCursor(null);
    setPresetPlaying(false);
    setMaxStepsState(cap);
    presetQueue.current = [];
  }, []);

  const newEpisode = useCallback(
    (s?: number | null) => {
      const next = s == null || Number.isNaN(s) ? randomMasterSeed() : Math.floor(s);
      resetTo(next, maxStepsRef.current);
    },
    [resetTo],
  );

  const setMaxSteps = useCallback((n: number) => {
    const cap = Math.max(1, Math.min(200, Math.floor(n) || LLM_MAX_STEPS));
    setMaxStepsState(cap);
    maxStepsRef.current = cap;
  }, []);

  const submit = useCallback((draft: LlmActionJson): string | null => {
    const prev = stateRef.current;
    if (prev.done) return 'episode already ended';
    const next = structuredClone(prev);
    const result = applyManualDraft(
      next,
      configRef.current,
      draft,
      rngRef.current,
      maxStepsRef.current,
    );
    if (!result.applied) return result.validationError;
    stateRef.current = next;
    setState(next);
    setSteps((xs) => [...xs, result.step]);
    return null;
  }, []);

  const stopPreset = useCallback(() => {
    if (presetTimer.current != null) {
      window.clearTimeout(presetTimer.current);
      presetTimer.current = null;
    }
    setPresetPlaying(false);
  }, []);

  const playPreset = useCallback(
    (fixture: PresetFixture) => {
      if (presetTimer.current != null) {
        window.clearTimeout(presetTimer.current);
        presetTimer.current = null;
      }
      const ep = freshEpisode(configRef.current, fixture.masterSeed);
      rngRef.current = ep.rng;
      stateRef.current = ep.state;
      setSeed(fixture.masterSeed);
      setState(ep.state);
      setSteps([]);
      setMaxStepsState(fixture.maxSteps);
      maxStepsRef.current = fixture.maxSteps;
      presetQueue.current = [...fixture.actions];
      setPresetCursor(0);
      setPresetPlaying(true);
    },
    [],
  );

  useEffect(() => {
    if (!presetPlaying || presetCursor == null) return;
    const draft = presetQueue.current[presetCursor];
    if (!draft) {
      setPresetPlaying(false);
      return;
    }
    presetTimer.current = window.setTimeout(() => {
      submit(draft);
      setPresetCursor((c) => (c == null ? 0 : c + 1));
    }, 180);
    return () => {
      if (presetTimer.current != null) window.clearTimeout(presetTimer.current);
    };
  }, [presetPlaying, presetCursor, submit]);

  const payloadText = useMemo(
    () => formatPlannerUserMessage(state, config),
    [state, config],
  );
  const payload = useMemo(
    () => serializePlannerView(state, config),
    [state, config],
  );

  const evidence = useMemo(
    () => (state.done ? buildGraderEvidence(state, config) : null),
    [state, config],
  );

  const scorecard = state.done ? scoreEpisode(state, config) : null;

  const transcript: EpisodeTranscript = useMemo(
    () => ({
      schemaVersion: 1,
      source: presetCursor != null ? 'preset' : 'manual',
      episodeId: state.seedData.episodeId,
      masterSeed: seed,
      domain: config.meta.id,
      domainLabel: config.meta.domainLabel,
      maxSteps,
      steps,
      scorecard,
      endedBy: transcriptEndedBy(scorecard, state.done),
    }),
    [state, seed, config, maxSteps, steps, scorecard, presetCursor],
  );

  const download = useCallback(() => {
    const id = transcript.episodeId;
    const json = JSON.stringify(transcript, null, 2) + '\n';
    const md = transcriptToMarkdown(transcript, config);
    const save = (name: string, body: string, type: string) => {
      const blob = new Blob([body], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
    save(`${id}.transcript.json`, json, 'application/json');
    save(`${id}.transcript.md`, md, 'text/markdown');
  }, [transcript, config]);

  return {
    config,
    state,
    seed,
    maxSteps,
    payloadText,
    payload,
    steps,
    evidence,
    transcript,
    presetCursor,
    presetPlaying,
    newEpisode,
    setMaxSteps,
    submit,
    playPreset,
    stopPreset,
    download,
  };
}
