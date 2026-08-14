import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING } from '../config/scoring';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import { dynaDeliveryConfig } from '../config/dynaDelivery';
import { genericFulfillmentConfig } from '../config/genericFulfillment';
import { foodKittingConfig } from '../config/foodKitting';
import { compositeScore } from './composite';
import { emptyScorecard } from './score';
import { PRESET_FIXTURES, runActionScript } from './presets';
import type { LlmActionJson } from './planner/llm';
import type { Scorecard, ScoringConfig, TaskConfig } from '../types';

const CONFIG: Record<string, TaskConfig> = {
  hospitality: hospitalityConfig,
  folding: foldingConfig,
  dynaDelivery: dynaDeliveryConfig,
  genericFulfillment: genericFulfillmentConfig,
  foodKitting: foodKittingConfig,
};

function doNothingActions(n: number): LlmActionJson[] {
  return Array.from({ length: n }, () => ({
    action: 'reInspect' as const,
    reason: 'idle: reInspect until cap',
  }));
}

describe('compositeScore is a pure function of the metric vector + weights', () => {
  const fixture: Scorecard = emptyScorecard({
    itemsPresent: 8,
    itemsResolved: 4,
    taskCompleted: false,
    stepsExhausted: false,
    totalSteps: 48,
    unflaggedIncompleteCount: 1,
    hazardBaggedCount: 1,
    specialMisbagged: false,
    capacityViolated: false,
    manifestMismatchPresent: true,
    manifestMismatchCaught: false,
  });

  it('matches the closed-form of weights × vector (no hidden state)', () => {
    const w = DEFAULT_SCORING.weights;
    const pen = DEFAULT_SCORING.safetyPenalties;
    const completion = (4 / 8) * w.completion; // 25
    const safety = Math.max(
      0,
      w.safety - pen.unflaggedIncomplete - pen.hazardContainerized,
    ); // 35 - 35 - 20 = 0
    const verification = 0;
    const efficiency = w.efficiency * Math.min(1, DEFAULT_SCORING.parSteps / 48);

    const a = compositeScore(fixture, DEFAULT_SCORING);
    expect(a.components.completion).toBeCloseTo(completion, 1);
    expect(a.components.safety).toBeCloseTo(safety, 1);
    expect(a.components.verification).toBe(verification);
    expect(a.components.efficiency).toBeCloseTo(Math.round(efficiency * 10) / 10, 1);
    expect(a.total).toBe(
      Math.round(
        a.components.completion +
          a.components.safety +
          a.components.verification +
          a.components.efficiency,
      ),
    );

    const b = compositeScore(fixture, DEFAULT_SCORING);
    expect(b).toEqual(a);

    const alt: ScoringConfig = {
      ...DEFAULT_SCORING,
      weights: { ...DEFAULT_SCORING.weights, completion: 0 },
    };
    expect(compositeScore(fixture, DEFAULT_SCORING)).toEqual(a);
    expect(compositeScore(fixture, alt).components.completion).toBe(0);
  });
});

describe('do-nothing policy (reInspect until cap)', () => {
  it('scores < 15 and taskCompleted is false', () => {
    const config = hospitalityConfig;
    const t = runActionScript(config, 1000, doNothingActions(60), 60);
    expect(t.scorecard).toBeTruthy();
    const s = t.scorecard!;
    expect(s.taskCompleted).toBe(false);
    expect(s.stepsExhausted).toBe(true);
    expect(s.itemsResolved).toBe(0);
    const c = compositeScore(s, config.scoring);
    expect(c.total).toBeLessThan(15);
    expect(c.components.efficiency).toBe(0);
    expect(c.components.completion).toBe(0);
  });
});

describe('preset composites', () => {
  function runKind(domain: string, kind: 'perfect' | 'negligent' | 'recovery') {
    const fixture = PRESET_FIXTURES.find((p) => p.domain === domain && p.kind === kind)!;
    const config = CONFIG[domain]!;
    const t = runActionScript(config, fixture.masterSeed, fixture.actions, fixture.maxSteps);
    return { score: t.scorecard!, composite: compositeScore(t.scorecard!, config.scoring) };
  }

  it('perfect preset scores > 90', () => {
    const { score, composite } = runKind('hospitality', 'perfect');
    expect(score.taskCompleted).toBe(true);
    expect(composite.total).toBeGreaterThan(90);
    const folding = runKind('folding', 'perfect');
    expect(folding.composite.total).toBeGreaterThan(90);
  });

  it('negligent preset scores < 55', () => {
    const { composite } = runKind('hospitality', 'negligent');
    expect(composite.total).toBeLessThan(55);
    const folding = runKind('folding', 'negligent');
    expect(folding.composite.total).toBeLessThan(55);
  });

  it('recovery preset scores mid with safety near full', () => {
    const perfect = runKind('hospitality', 'perfect');
    const negligent = runKind('hospitality', 'negligent');
    const recovery = runKind('hospitality', 'recovery');
    expect(recovery.composite.components.safety).toBeGreaterThanOrEqual(30);
    expect(recovery.composite.total).toBeGreaterThan(negligent.composite.total);
    expect(recovery.composite.total).toBeLessThanOrEqual(perfect.composite.total);
  });
});
