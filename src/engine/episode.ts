import type {
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
  type Rng,
  type StreamBundle,
} from './rng';

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

export function generateEpisodeSeed(
  config: TaskConfig,
  masterSeed: number,
  episodeSerial = 1,
): { seedData: EpisodeSeedData; streams: StreamBundle } {
  const streams = deriveStreams(masterSeed);
  const rng = streams.streamEpisode;

  const itemCount = randInt(rng, config.itemCountMin, config.itemCountMax);
  const wantSpecial = chance(rng, config.specialItemEpisodeRate);
  const specialIndex = wantSpecial ? randInt(rng, 0, itemCount - 1) : -1;

  const items: Item[] = [];
  for (let i = 0; i < itemCount; i++) {
    const attributeId = sampleAttribute(config, rng, i === specialIndex);
    items.push({
      id: `item-${i + 1}`,
      index: i + 1,
      attributeId,
      label: `${config.ui.itemLabel}-${String(i + 1).padStart(2, '0')}`,
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

  const deltaRange = randInt(rng, config.manifest.discrepancyMin, config.manifest.discrepancyMax);
  const sign = chance(rng, 0.5) ? 1 : -1;
  const delta = deltaRange === 0 ? 0 : sign * deltaRange;
  const manifestClaimed = Math.max(1, itemCount + delta);

  const containerCapacity = randInt(
    rng,
    config.containers.capacityMin,
    config.containers.capacityMax,
  );

  const skills: SkillRuntime[] = config.skills.map((s) => {
    const jitter = (rng() * 2 - 1) * config.skillFailJitter;
    const failRate = Math.min(0.95, Math.max(0.01, s.baseFailRate + jitter));
    return { id: s.id, failRate };
  });

  const hasSpecialItem = items.some((it) => attrById(config, it.attributeId).special);
  const hasHazardItem = items.some((it) => attrById(config, it.attributeId).hazard);
  const hasManifestMismatch = manifestClaimed !== itemCount;

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
  };

  return { seedData, streams };
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
  }));

  return {
    seedData,
    mode,
    beliefs,
    containers: [
      {
        id: 'c0',
        capacity: seedData.containerCapacity,
        itemIds: [],
      },
    ],
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
    },
    step: 0,
    done: false,
    actions: [],
    plannerLines: [],
    executorLines: [],
    pendingItemQueue: seedData.items.map((it) => it.id),
    failCounts: {},
    lastFailKey: null,
  };
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
