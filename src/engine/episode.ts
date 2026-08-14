import type {
  Container,
  EpisodeOrder,
  EpisodeSeedData,
  EpisodeState,
  Item,
  ItemBelief,
  PolicyMode,
  SkillRuntime,
  TaskConfig,
} from '../types';
import {
  chance,
  deriveStreams,
  formatEpisodeId,
  pickWeighted,
  randInt,
  shuffle,
  type Rng,
  type StreamBundle,
} from './rng';
import {
  confuseType,
  hasOrders,
  itemAppearsLabel,
  streamEnabled,
  visibleUnresolvedIds,
} from './fulfillment';
import * as T from '../copy/traces';

function attrById(config: TaskConfig, id: string) {
  return config.itemAttributes.find((a) => a.id === id)!;
}

function normalAttrId(config: TaskConfig): string {
  return config.itemAttributes.find((a) => a.normal)?.id ?? config.itemAttributes[0]!.id;
}

function specialAttrIds(config: TaskConfig): string[] {
  return config.itemAttributes.filter((a) => a.special).map((a) => a.id);
}

function sampleAttribute(config: TaskConfig, rng: Rng, forceSpecial: boolean): string {
  if (forceSpecial) {
    const specs = specialAttrIds(config);
    if (specs.length) {
      return specs[randInt(rng, 0, specs.length - 1)]!;
    }
  }
  const weights = config.itemAttributes.map((a) => ({
    id: a.id,
    w: config.attributeWeights[a.id] ?? 0.1,
  }));
  return pickWeighted(rng, weights);
}

function foreignAttrIds(config: TaskConfig): string[] {
  return config.itemAttributes.filter((a) => a.hazardClass === 'foreignObject').map((a) => a.id);
}

function conditionHazardIds(config: TaskConfig): string[] {
  return config.itemAttributes
    .filter((a) => a.hazard && a.hazardClass !== 'foreignObject')
    .map((a) => a.id);
}

const DEFAULT_SHORT_EPISODE_RATE = 0.25;
const DEFAULT_MAX_SHORT = 2;
const DEFAULT_HAZARD_EXTRA_RATE = 0.55;

function sampleTypeId(config: TaskConfig, rng: Rng): string | null {
  const types = config.itemTypes ?? [];
  if (!types.length) return null;
  return types[randInt(rng, 0, types.length - 1)]!.id;
}

function claimedFromStreamCount(config: TaskConfig, rng: Rng, streamCount: number): number {
  const deltaRange = randInt(rng, config.manifest.discrepancyMin, config.manifest.discrepancyMax);
  const sign = chance(rng, 0.5) ? 1 : -1;
  const delta = deltaRange === 0 ? 0 : sign * deltaRange;
  return Math.max(1, streamCount + delta);
}

function emptyItemTypeFields(): Pick<Item, 'trueType' | 'glanceType' | 'destOrderId'> {
  return { trueType: null, glanceType: null, destOrderId: null };
}

function generateOrderEpisode(
  config: TaskConfig,
  rng: Rng,
): { items: Item[]; orders: EpisodeOrder[]; containerCapacity: number } {
  const pool = config.orders ?? [];
  const range = config.ordersPerEpisode;
  const take =
    range != null
      ? randInt(rng, range.min, Math.min(range.max, pool.length))
      : pool.length;
  const selected = shuffle(rng, pool).slice(0, Math.max(1, take));

  const orders: EpisodeOrder[] = [];
  for (const order of selected) {
    orders.push({
      id: order.id,
      label: order.label,
      lines: order.lines.map((line) => ({
        typeId: line.typeId,
        count: line.count,
        supplied: line.count,
      })),
    });
  }

  const shortRate = config.shortShip?.shortEpisodeRate ?? DEFAULT_SHORT_EPISODE_RATE;
  const maxShort = config.shortShip?.maxShort ?? DEFAULT_MAX_SHORT;
  if (chance(rng, shortRate)) {
    const candidates = orders.flatMap((o) => o.lines.filter((l) => l.count > 0));
    if (candidates.length) {
      const line = candidates[randInt(rng, 0, candidates.length - 1)]!;
      const drop = randInt(rng, 1, Math.min(maxShort, line.count));
      line.supplied = line.count - drop;
    }
  }

  const normalId = normalAttrId(config);
  const rawItems: Omit<Item, 'id' | 'index' | 'label'>[] = [];
  for (const order of orders) {
    for (const line of order.lines) {
      for (let i = 0; i < line.supplied; i++) {
        rawItems.push({
          attributeId: normalId,
          trueType: line.typeId,
          glanceType: null,
          destOrderId: order.id,
        });
      }
    }
  }

  const foreignIds = foreignAttrIds(config);
  const wantForeign = foreignIds.length > 0 && chance(rng, config.foreignObjectEpisodeRate ?? 0.55);
  if (wantForeign) {
    const n = randInt(rng, 1, Math.min(2, foreignIds.length));
    for (let i = 0; i < n; i++) {
      rawItems.push({
        attributeId: foreignIds[randInt(rng, 0, foreignIds.length - 1)]!,
        trueType: null,
        glanceType: null,
        destOrderId: null,
      });
    }
  }

  const hazardIds = conditionHazardIds(config);
  const wantHazard =
    hazardIds.length > 0 && chance(rng, config.hazardExtraEpisodeRate ?? DEFAULT_HAZARD_EXTRA_RATE);
  if (wantHazard) {
    const n = randInt(rng, 1, 2);
    for (let i = 0; i < n; i++) {
      rawItems.push({
        attributeId: hazardIds[randInt(rng, 0, hazardIds.length - 1)]!,
        trueType: sampleTypeId(config, rng),
        glanceType: null,
        destOrderId: null,
      });
    }
  }

  const shuffled = shuffle(rng, rawItems);
  const items: Item[] = shuffled.map((it, i) => {
    const glanceType =
      it.trueType != null ? confuseType(config, it.trueType, rng) : null;
    return {
      id: `item-${i + 1}`,
      index: i + 1,
      attributeId: it.attributeId,
      label: `${config.ui.itemLabel}-${String(i + 1).padStart(2, '0')}`,
      trueType: it.trueType,
      glanceType,
      destOrderId: it.destOrderId,
    };
  });

  const containerCapacity = randInt(
    rng,
    config.containers.capacityMin,
    config.containers.capacityMax,
  );

  return { items, orders, containerCapacity };
}

export function generateEpisodeSeed(
  config: TaskConfig,
  masterSeed: number,
  episodeSerial = 1,
): { seedData: EpisodeSeedData; streams: StreamBundle } {
  const streams = deriveStreams(masterSeed);
  const rng = streams.streamEpisode;

  let items: Item[];
  let orders: EpisodeOrder[] = [];
  let containerCapacity: number;
  let manifestClaimed: number;
  let streamOn = false;
  let streamBatchSize = 0;

  if (hasOrders(config)) {
    const gen = generateOrderEpisode(config, rng);
    items = gen.items;
    orders = gen.orders;
    containerCapacity = gen.containerCapacity;
    manifestClaimed = claimedFromStreamCount(config, rng, items.length);
    streamOn = streamEnabled(config);
    if (streamOn) {
      const a = config.arrivalStream!;
      streamBatchSize = randInt(rng, a.batchSizeMin, a.batchSizeMax);
    }
  } else {
    const itemCount = randInt(rng, config.itemCountMin, config.itemCountMax);
    const wantSpecial = chance(rng, config.specialItemEpisodeRate);
    const specialIndex = wantSpecial ? randInt(rng, 0, itemCount - 1) : -1;

    items = [];
    for (let i = 0; i < itemCount; i++) {
      const attributeId = sampleAttribute(config, rng, i === specialIndex);
      items.push({
        id: `item-${i + 1}`,
        index: i + 1,
        attributeId,
        label: `${config.ui.itemLabel}-${String(i + 1).padStart(2, '0')}`,
        ...emptyItemTypeFields(),
      });
    }

    // Ensure special if requested but sampling missed
    if (wantSpecial && specialAttrIds(config).length) {
      const has = items.some((it) => attrById(config, it.attributeId).special);
      if (!has) {
        const idx = specialIndex >= 0 ? specialIndex : 0;
        const sid = specialAttrIds(config)[0]!;
        items[idx] = {
          ...items[idx]!,
          attributeId: sid,
        };
      }
    }

    manifestClaimed = claimedFromStreamCount(config, rng, itemCount);

    containerCapacity = randInt(
      rng,
      config.containers.capacityMin,
      config.containers.capacityMax,
    );
  }

  const skills: SkillRuntime[] = config.skills.map((s) => {
    const jitter = (rng() * 2 - 1) * config.skillFailJitter;
    const failRate = Math.min(0.95, Math.max(0.01, s.baseFailRate + jitter));
    return { id: s.id, failRate };
  });

  const hasSpecialItem = items.some((it) => attrById(config, it.attributeId).special);
  const hasHazardItem = items.some((it) => attrById(config, it.attributeId).hazard);
  const hasManifestMismatch = manifestClaimed !== items.length;

  const seedData: EpisodeSeedData = {
    masterSeed,
    episodeId: formatEpisodeId(episodeSerial),
    items,
    manifestClaimed,
    containerCapacity,
    skills,
    hasManifestMismatch,
    hasSpecialItem,
    hasHazardItem,
    orders,
    streamEnabled: streamOn,
    streamBatchSize,
    arrivalOrder: items.map((it) => it.id),
  };

  return { seedData, streams };
}

function initialContainers(seedData: EpisodeSeedData, config: TaskConfig): Container[] {
  if (!seedData.orders.length) {
    return [
      {
        id: 'c0',
        capacity: seedData.containerCapacity,
        itemIds: [],
      },
    ];
  }
  const containers: Container[] = [];
  for (const order of seedData.orders) {
    const defs = config.orders?.find((o) => o.id === order.id)?.containers ?? [{ id: `${order.id}-c0` }];
    const list = defs.length ? defs : [{ id: `${order.id}-c0` }];
    list.forEach((def, i) => {
      containers.push({
        id: def.id ?? `${order.id}-c${i}`,
        capacity: def.capacity ?? seedData.containerCapacity,
        itemIds: [],
        orderId: order.id,
        label: def.label ?? `${order.label} ${config.containers.label} ${i + 1}`,
        committedFoldProfile: null,
      });
    });
  }
  return containers;
}

export function arrivalObsLines(
  state: EpisodeState,
  config: TaskConfig,
  itemIds: string[],
): string[] {
  if (!itemIds.length) return [];
  const appearances = itemIds.map((id) => {
    const item = getItem(state, id);
    const believed = state.beliefs.find((b) => b.itemId === id)?.believedType ?? item.glanceType;
    return itemAppearsLabel(config, item, believed);
  });
  return [T.obsArrival({ count: itemIds.length, appearances })];
}

/**
 * Admit the next inbound wave when the visible workspace is clear.
 * Returns newly visible item ids (empty if nothing admitted).
 */
export function maybeAdmitBatch(state: EpisodeState, config: TaskConfig): string[] {
  void config;
  if (!state.seedData.streamEnabled) return [];
  if (visibleUnresolvedIds(state).length > 0) return [];
  if (state.inboundQueue.length === 0) return [];
  const k = Math.max(1, state.seedData.streamBatchSize);
  const next = state.inboundQueue.splice(0, k);
  state.visibleItemIds.push(...next);
  for (const id of next) {
    if (!state.pendingItemQueue.includes(id)) state.pendingItemQueue.push(id);
  }
  state.arrivalBatches.push(next);
  return next;
}

export function createInitialState(
  seedData: EpisodeSeedData,
  mode: PolicyMode,
  config: TaskConfig,
): EpisodeState {
  const normalId = normalAttrId(config);
  const beliefs: ItemBelief[] = seedData.items.map((it) => ({
    itemId: it.id,
    // Coarse prior: assume normal until inspect
    attributeId: normalId,
    inspected: false,
    believedType: it.glanceType,
    typeConfirmed: false,
  }));

  const allIds = seedData.items.map((it) => it.id);
  const streamOn = seedData.streamEnabled;
  const batch = streamOn ? Math.max(1, seedData.streamBatchSize) : allIds.length;
  const visibleItemIds = streamOn ? allIds.slice(0, batch) : [...allIds];
  const inboundQueue = streamOn ? allIds.slice(batch) : [];

  const state: EpisodeState = {
    seedData,
    mode,
    beliefs,
    containers: initialContainers(seedData, config),
    setAsideIds: [],
    heldItemId: null,
    itemPhase: Object.fromEntries(seedData.items.map((it) => [it.id, 'raw' as const])),
    flags: {
      manifestChecked: false,
      manifestMismatchCaught: false,
      escalated: false,
      recoveryAttempted: false,
      recoverySucceeded: false,
      hadExecutorFailure: false,
      capacityViolated: false,
      hazardBaggedCount: 0,
      specialMisbagged: false,
      openedSecondContainer: false,
      unflaggedIncompleteCount: 0,
      flaggedIncompleteCount: 0,
      recoveryGiveUp: false,
      hadRepeatedFailure: false,
      invalidActionCount: 0,
      stepsExhausted: false,
      misroutedCount: 0,
      foreignObjectContainerized: 0,
      typeMisfoldCount: 0,
      shortShipFlagged: false,
      shortShipHeld: false,
    },
    step: 0,
    done: false,
    actions: [],
    plannerLines: [],
    executorLines: [],
    pendingItemQueue: [...visibleItemIds],
    inboundQueue,
    visibleItemIds: [...visibleItemIds],
    arrivalBatches: visibleItemIds.length ? [[...visibleItemIds]] : [],
    failCounts: {},
    maxFailStreak: Object.fromEntries(seedData.items.map((it) => [it.id, 0])),
    itemResolution: Object.fromEntries(
      seedData.items.map((it) => [it.id, 'pending' as const]),
    ),
    lastFailKey: null,
  };

  if (streamOn && visibleItemIds.length) {
    attachArrivalObs(state, config, visibleItemIds);
  }
  return state;
}

function attachArrivalObs(
  state: EpisodeState,
  config: TaskConfig,
  itemIds: string[],
): EpisodeState {
  let n = 0;
  for (const text of arrivalObsLines(state, config, itemIds)) {
    n += 1;
    state.executorLines.push({
      id: `A${n}`,
      channel: 'executor',
      text,
    });
  }
  return state;
}

export function getItem(state: EpisodeState, id: string): Item {
  return state.seedData.items.find((i) => i.id === id)!;
}

export function getAttr(config: TaskConfig, attributeId: string) {
  return config.itemAttributes.find((a) => a.id === attributeId)!;
}

export function beliefAttr(
  state: EpisodeState,
  config: TaskConfig,
  itemId: string,
): string {
  const b = state.beliefs.find((x) => x.itemId === itemId);
  if (b?.inspected && b.attributeId) return b.attributeId;
  return b?.attributeId ?? normalAttrId(config);
}

export function trueAttr(state: EpisodeState, itemId: string): string {
  return getItem(state, itemId).attributeId;
}

export function skillByRole(config: TaskConfig, role: string) {
  return config.skills.find((s) => s.role === role);
}

export function skillRuntime(state: EpisodeState, skillId: string): SkillRuntime {
  return state.seedData.skills.find((s) => s.id === skillId)!;
}

export function totalPlaced(state: EpisodeState): number {
  return state.containers.reduce((n, c) => n + c.itemIds.length, 0);
}

export function activeContainer(state: EpisodeState) {
  return state.containers[state.containers.length - 1]!;
}

export function remainingToPlace(state: EpisodeState): number {
  return state.seedData.items.length - totalPlaced(state) - state.setAsideIds.length;
}
