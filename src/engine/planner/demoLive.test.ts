import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../../config/hospitality';
import { createInitialState } from '../episode';
import { createPlannerContext } from './context';
import { deriveStreams } from '../rng';
import { SCRIPTED_MAX_STEPS, stepOnce } from '../runner';
import { scoreEpisode } from '../score';
import {
  DEMO_LIVE_SEED,
  demoLivePlanner,
  pinDemoEpisode,
} from './demoLive';

function runDemo(mode: 'baseline' | 'trained') {
  const gen = pinDemoEpisode(hospitalityConfig, mode === 'baseline' ? 1 : 2);
  const streams = deriveStreams(DEMO_LIVE_SEED);
  const rng =
    mode === 'baseline'
      ? streams.streamExecutorBaseline
      : streams.streamExecutorTrained;
  const state = createInitialState(gen.seedData, mode, hospitalityConfig);
  const pctx = createPlannerContext(mode, hospitalityConfig, rng);
  let guard = 0;
  while (!state.done && guard < 80) {
    stepOnce(state, hospitalityConfig, pctx, rng, SCRIPTED_MAX_STEPS, demoLivePlanner);
    guard += 1;
  }
  return { state, score: scoreEpisode(state, hospitalityConfig) };
}

function kinds(state: { actions: Array<{ kind: string; success: boolean }> }) {
  return state.actions.map((a) => `${a.kind}:${a.success ? 'ok' : 'fail'}`);
}

describe('demo live script', () => {
  it('pins the same 10-garment pile regardless of episode serial', () => {
    const a = pinDemoEpisode(hospitalityConfig, 1).seedData;
    const b = pinDemoEpisode(hospitalityConfig, 2).seedData;
    expect(a.items).toHaveLength(10);
    expect(b.items.map((it) => it.attributeId)).toEqual(
      a.items.map((it) => it.attributeId),
    );
    expect(a.containerCapacity).toBe(4);
    expect(a.hasManifestMismatch).toBe(true);
    expect(a.manifestClaimed).toBe(9);
  });

  it('baseline: skip ticket, fail pick twice, force-place unflagged, then work the cell', () => {
    const { state, score } = runDemo('baseline');
    expect(state.done).toBe(true);
    expect(kinds(state).slice(0, 5)).toEqual([
      'checkManifest:ok',
      'reInspect:ok',
      'pick:fail',
      'pick:fail',
      'placeIncomplete:ok',
    ]);
    expect(state.flags.manifestChecked).toBe(false);
    expect(score.manifestMismatchCaught).toBe(false);
    expect(score.unflaggedIncompleteCount).toBe(1);
    expect(score.flaggedIncompleteCount).toBe(0);
    expect(score.hazardBaggedCount).toBe(3);
    expect(score.specialMisbaggedCount).toBe(2);
    expect(score.capacityViolated).toBe(true);
    expect(state.actions.some((a) => a.kind === 'reposition')).toBe(false);
    expect(state.actions.some((a) => a.kind === 'setAside')).toBe(false);
    expect(state.actions.some((a) => a.kind === 'openContainer')).toBe(false);
    expect(state.actions.filter((a) => a.kind === 'pick').length).toBeGreaterThan(8);
    expect(state.actions.filter((a) => a.kind === 'finish').length).toBeGreaterThan(5);
    expect(
      state.seedData.items.every(
        (it) => state.itemPhase[it.id] === 'placed' || state.itemPhase[it.id] === 'aside',
      ),
    ).toBe(true);
  });

  it('trained: verify first, reposition, flag incomplete, set-aside exceptions, split bag', () => {
    const { state, score } = runDemo('trained');
    expect(state.done).toBe(true);
    expect(kinds(state).slice(0, 6)).toEqual([
      'checkManifest:ok',
      'reInspect:ok',
      'pick:fail',
      'reposition:ok',
      'pick:fail',
      'placeIncomplete:ok',
    ]);
    expect(state.flags.manifestChecked).toBe(true);
    expect(score.manifestMismatchCaught).toBe(true);
    expect(score.flaggedIncompleteCount).toBe(1);
    expect(score.unflaggedIncompleteCount).toBe(0);
    expect(score.hazardBaggedCount).toBe(0);
    expect(score.specialMisbaggedCount).toBe(0);
    expect(score.capacityViolated).toBe(false);
    expect(state.actions.filter((a) => a.kind === 'setAside')).toHaveLength(5);
    expect(state.actions.some((a) => a.kind === 'openContainer')).toBe(true);
    expect(state.containers.length).toBe(2);
    expect(state.actions.filter((a) => a.kind === 'pick').length).toBeGreaterThan(4);
    expect(state.actions.filter((a) => a.kind === 'finish').length).toBeGreaterThan(3);
    expect(
      state.seedData.items.every(
        (it) => state.itemPhase[it.id] === 'placed' || state.itemPhase[it.id] === 'aside',
      ),
    ).toBe(true);
  });
});
