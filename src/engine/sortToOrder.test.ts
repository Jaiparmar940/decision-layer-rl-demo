import { describe, expect, it } from 'vitest';
import { dynaDeliveryConfig } from '../config/dynaDelivery';
import { genericFulfillmentConfig } from '../config/genericFulfillment';
import { foodKittingConfig } from '../config/foodKitting';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import { generateEpisodeSeed, createInitialState } from './episode';
import { applyPlannerAction, runEpisode } from './runner';
import { compositeScore } from './composite';
import { emptyScorecard } from './score';
import { mulberry32 } from './rng';
import { hasGenuineShort, isForeignObject } from './fulfillment';
import { batchMasterSeed } from './batch';
import type { TaskConfig } from '../types';

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

  it('foodKitting also shares ground truth across modes', () => {
    const seed = 777;
    const base = runEpisode({
      config: foodKittingConfig,
      masterSeed: seed,
      mode: 'baseline',
      episodeSerial: 1,
    });
    const train = runEpisode({
      config: foodKittingConfig,
      masterSeed: seed,
      mode: 'trained',
      episodeSerial: 1,
    });
    expect(base.state.seedData.items.map((i) => i.glanceType)).toEqual(
      train.state.seedData.items.map((i) => i.glanceType),
    );
  });

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

  it('foodKitting sauceSachet↔gfSauceSachet and seasoningStd↔seasoningLowNa within ±3pts', () => {
    const n = 1000;
    const counts: Record<string, { n: number; confused: number }> = {
      sauceSachet: { n: 0, confused: 0 },
      gfSauceSachet: { n: 0, confused: 0 },
      seasoningStd: { n: 0, confused: 0 },
      seasoningLowNa: { n: 0, confused: 0 },
    };
    const pair: Record<string, string> = {
      sauceSachet: 'gfSauceSachet',
      gfSauceSachet: 'sauceSachet',
      seasoningStd: 'seasoningLowNa',
      seasoningLowNa: 'seasoningStd',
    };
    for (let i = 0; i < n; i++) {
      const { seedData } = generateEpisodeSeed(foodKittingConfig, 9000 + i * 17, i + 1);
      for (const it of seedData.items) {
        const row = it.trueType ? counts[it.trueType] : undefined;
        if (!row || !it.trueType) continue;
        row.n += 1;
        if (it.glanceType === pair[it.trueType]) row.confused += 1;
      }
    }
    for (const [id, row] of Object.entries(counts)) {
      expect(row.n, id).toBeGreaterThan(100);
      expect(Math.abs(row.confused / row.n - 0.15), id).toBeLessThanOrEqual(0.03);
    }
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

  it('foodKitting pick emits handle confirmation OBS for a confusable pair', () => {
    let found = false;
    for (let seed = 1; seed < 120 && !found; seed++) {
      const { seedData } = generateEpisodeSeed(foodKittingConfig, seed, 1);
      const state = createInitialState(seedData, 'llm', foodKittingConfig);
      const target = seedData.items.find(
        (it) =>
          state.visibleItemIds.includes(it.id) &&
          (it.trueType === 'sauceSachet' || it.trueType === 'gfSauceSachet') &&
          it.glanceType &&
          it.trueType !== it.glanceType,
      );
      if (!target) continue;
      found = true;
      for (let i = 0; i < 8 && state.itemPhase[target.id] !== 'picked'; i++) {
        applyPlannerAction(
          state,
          foodKittingConfig,
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
      expect(afterPick.typeConfirmed).toBe(true);
      expect(afterPick.believedType).toBe(target.trueType);
      const obs = state.executorLines.map((l) => l.text).join('\n');
      expect(obs).toMatch(/OBS: handle .+ — type confirms as /);
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

function ticketedUnits(seed: { orders: { lines: { count: number; supplied: number }[] }[] }) {
  return seed.orders.reduce(
    (n, o) => n + o.lines.reduce((m, l) => m + l.count, 0),
    0,
  );
}

function suppliedUnits(seed: { orders: { lines: { supplied: number }[] }[] }) {
  return seed.orders.reduce(
    (n, o) => n + o.lines.reduce((m, l) => m + l.supplied, 0),
    0,
  );
}

function assertFulfillableByDefault(config: TaskConfig) {
  const n = 1000;
  let shortEps = 0;
  let claimedEqualsStream = 0;
  let claimedEqualsTicketed = 0;
  let multiLineShort = 0;

  for (let i = 0; i < n; i++) {
    const { seedData } = generateEpisodeSeed(config, batchMasterSeed(i), i + 1);
    const required = seedData.items.filter((it) => it.destOrderId != null);
    expect(required.every((it) => it.attributeId === 'normal')).toBe(true);
    expect(required.length).toBe(suppliedUnits(seedData));

    const extras = seedData.items.filter((it) => it.destOrderId == null);
    for (const it of extras) {
      const foreign = isForeignObject(config, it);
      const attr = config.itemAttributes.find((a) => a.id === it.attributeId)!;
      expect(foreign || attr.hazard).toBe(true);
    }

    const shortLines = seedData.orders.flatMap((o) =>
      o.lines.filter((l) => l.supplied < l.count),
    );
    if (shortLines.length > 1) multiLineShort += 1;
    if (shortLines.length === 1) {
      const line = shortLines[0]!;
      const drop = line.count - line.supplied;
      expect(drop).toBeGreaterThanOrEqual(1);
      expect(drop).toBeLessThanOrEqual(2);
    }
    if (hasGenuineShort(seedData.orders)) shortEps += 1;

    const stream = seedData.items.length;
    const delta = Math.abs(seedData.manifestClaimed - stream);
    expect(delta).toBeLessThanOrEqual(2);
    if (seedData.manifestClaimed === stream) claimedEqualsStream += 1;
    if (seedData.manifestClaimed === ticketedUnits(seedData)) claimedEqualsTicketed += 1;
  }

  expect(multiLineShort).toBe(0);
  expect(shortEps / n).toBeGreaterThanOrEqual(0.2);
  expect(shortEps / n).toBeLessThanOrEqual(0.3);
  // Claimed tracks the stream with noise, not the order-line sum.
  expect(claimedEqualsTicketed / n).toBeLessThan(0.5);
  expect(claimedEqualsStream / n).toBeGreaterThan(0.2);
}

describe('sort-to-order: fulfillable-by-default generation', () => {
  it('dynaDelivery: stream from order lines; extras on top; independent ticket noise', () => {
    assertFulfillableByDefault(dynaDeliveryConfig);
  });

  it('genericFulfillment: stream from order lines; extras on top; independent ticket noise', () => {
    assertFulfillableByDefault(genericFulfillmentConfig);
  });

  it('foodKitting: stream from order lines; extras on top; independent ticket noise', () => {
    assertFulfillableByDefault(foodKittingConfig);
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
