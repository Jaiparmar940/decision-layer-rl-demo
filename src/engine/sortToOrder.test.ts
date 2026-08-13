import { describe, expect, it } from 'vitest';
import { dynaDeliveryConfig } from '../config/dynaDelivery';
import { genericFulfillmentConfig } from '../config/genericFulfillment';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import { generateEpisodeSeed, createInitialState } from './episode';
import { applyPlannerAction, runEpisode } from './runner';
import { compositeScore } from './composite';
import { emptyScorecard } from './score';
import { mulberry32 } from './rng';

describe('sort-to-order: seed-reproducible stream arrivals', () => {
  const seeds = [1, 42, 8813, 4242];

  for (const seed of seeds) {
    it(`dynaDelivery seed ${seed}: arrivals + glance types match across modes`, () => {
      const a = generateEpisodeSeed(dynaDeliveryConfig, seed, 3).seedData;
      const b = generateEpisodeSeed(dynaDeliveryConfig, seed, 3).seedData;
      expect(a.items).toEqual(b.items);
      expect(a.arrivalOrder).toEqual(b.arrivalOrder);
      expect(a.orders).toEqual(b.orders);
      expect(a.streamBatchSize).toBe(b.streamBatchSize);

      const base = runEpisode({
        config: dynaDeliveryConfig,
        masterSeed: seed,
        mode: 'baseline',
        episodeSerial: 3,
      });
      const train = runEpisode({
        config: dynaDeliveryConfig,
        masterSeed: seed,
        mode: 'trained',
        episodeSerial: 3,
      });

      expect(base.state.seedData.items).toEqual(train.state.seedData.items);
      expect(base.state.arrivalBatches[0]).toEqual(train.state.arrivalBatches[0]);
      expect(base.state.seedData.arrivalOrder).toEqual(train.state.seedData.arrivalOrder);
      const concat = (batches: string[][]) => batches.flat();
      expect(concat(base.state.arrivalBatches)).toEqual(base.state.seedData.arrivalOrder);
      expect(concat(train.state.arrivalBatches)).toEqual(train.state.seedData.arrivalOrder);
    });
  }

  it('genericFulfillment also shares ground truth across modes', () => {
    const seed = 777;
    const base = runEpisode({
      config: genericFulfillmentConfig,
      masterSeed: seed,
      mode: 'baseline',
      episodeSerial: 1,
    });
    const train = runEpisode({
      config: genericFulfillmentConfig,
      masterSeed: seed,
      mode: 'trained',
      episodeSerial: 1,
    });
    expect(base.state.seedData.items.map((i) => i.glanceType)).toEqual(
      train.state.seedData.items.map((i) => i.glanceType),
    );
  });
});

describe('sort-to-order: type confusion empirical rate', () => {
  it('handTowel↔bathTowel within ±3pts over 1000 episodes', () => {
    const n = 1000;
    let handTrue = 0;
    let handAsBath = 0;
    let bathTrue = 0;
    let bathAsHand = 0;
    for (let i = 0; i < n; i++) {
      const { seedData } = generateEpisodeSeed(dynaDeliveryConfig, 9000 + i * 17, i + 1);
      for (const it of seedData.items) {
        if (it.trueType === 'handTowel') {
          handTrue += 1;
          if (it.glanceType === 'bathTowel') handAsBath += 1;
        }
        if (it.trueType === 'bathTowel') {
          bathTrue += 1;
          if (it.glanceType === 'handTowel') bathAsHand += 1;
        }
      }
    }
    expect(handTrue).toBeGreaterThan(200);
    expect(bathTrue).toBeGreaterThan(200);
    expect(Math.abs(handAsBath / handTrue - 0.15)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(bathAsHand / bathTrue - 0.15)).toBeLessThanOrEqual(0.03);
  });
});

describe('sort-to-order: type confirm is handle-only', () => {
  it('reInspect does not correct believedType; pick does', () => {
    let found = false;
    for (let seed = 1; seed < 80 && !found; seed++) {
      const { seedData } = generateEpisodeSeed(dynaDeliveryConfig, seed, 1);
      const state = createInitialState(seedData, 'llm', dynaDeliveryConfig);
      const target = seedData.items.find(
        (it) =>
          state.visibleItemIds.includes(it.id) &&
          it.trueType &&
          it.glanceType &&
          it.trueType !== it.glanceType,
      );
      if (!target) continue;
      found = true;
      const before = state.beliefs.find((b) => b.itemId === target.id)!.believedType;
      expect(before).toBe(target.glanceType);
      expect(before).not.toBe(target.trueType);

      applyPlannerAction(
        state,
        dynaDeliveryConfig,
        { kind: 'reInspect', plannerLines: ['inspect'] },
        mulberry32(1),
      );
      const afterInspect = state.beliefs.find((b) => b.itemId === target.id)!;
      expect(afterInspect.believedType).toBe(target.glanceType);
      expect(afterInspect.typeConfirmed).toBe(false);

      // Retry pick until motor success so type confirm is observable.
      for (let i = 0; i < 8 && state.itemPhase[target.id] !== 'picked'; i++) {
        applyPlannerAction(
          state,
          dynaDeliveryConfig,
          {
            kind: 'pick',
            skillId: 'pick',
            itemId: target.id,
            plannerLines: ['pick'],
          },
          mulberry32(100 + i),
        );
      }
      expect(state.itemPhase[target.id]).toBe('picked');
      const afterPick = state.beliefs.find((b) => b.itemId === target.id)!;
      expect(afterPick.believedType).toBe(target.trueType);
      expect(afterPick.typeConfirmed).toBe(true);
    }
    expect(found).toBe(true);
  });
});

describe('sort-to-order: arrival OBS', () => {
  it('initial executor lines include an arrival OBS with appears-types', () => {
    const { seedData } = generateEpisodeSeed(dynaDeliveryConfig, 1001, 1);
    const state = createInitialState(seedData, 'baseline', dynaDeliveryConfig);
    const obs = state.executorLines.map((l) => l.text).join('\n');
    expect(obs).toMatch(/OBS: \d+ items? arrived — appears /);
  });

  it('hospitality does not emit arrival OBS (stream off)', () => {
    const { seedData } = generateEpisodeSeed(hospitalityConfig, 1001, 1);
    const state = createInitialState(seedData, 'baseline', hospitalityConfig);
    expect(state.executorLines.some((l) => l.text.startsWith('OBS:'))).toBe(false);
    expect(state.inboundQueue).toEqual([]);
    expect(state.visibleItemIds).toHaveLength(seedData.items.length);
  });
});

describe('sort-to-order: composite completion uses order lines', () => {
  it('order-line fraction, not items-resolved, when orders present', () => {
    const score = emptyScorecard({
      itemsPresent: 10,
      itemsResolved: 10,
      orderLineUnitsFulfilled: 4,
      orderLineUnitsTotal: 8,
      taskCompleted: false,
    });
    const c = compositeScore(score, dynaDeliveryConfig.scoring);
    expect(c.components.completion).toBeCloseTo(25, 1);
  });

  it('legacy configs still use items-resolved', () => {
    const score = emptyScorecard({
      itemsPresent: 8,
      itemsResolved: 4,
      orderLineUnitsTotal: 0,
    });
    const c = compositeScore(score, hospitalityConfig.scoring);
    expect(c.components.completion).toBeCloseTo(25, 1);
  });
});

describe('sort-to-order: folding/hospitality still generate without types', () => {
  it('items have null type fields', () => {
    const h = generateEpisodeSeed(hospitalityConfig, 3, 1).seedData;
    const f = generateEpisodeSeed(foldingConfig, 3, 1).seedData;
    expect(h.orders).toEqual([]);
    expect(f.orders).toEqual([]);
    expect(h.items.every((i) => i.trueType === null)).toBe(true);
    expect(f.streamEnabled).toBe(false);
  });
});
