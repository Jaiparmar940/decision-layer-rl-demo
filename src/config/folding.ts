import type { TaskConfig } from '../types';

export const foldingConfig: TaskConfig = {
  meta: {
    id: 'folding',
    title: 'COMMERCIAL: LAUNDRY FOLDING',
    domainLabel: 'COMMERCIAL: LAUNDRY FOLDING',
    footerOneLiner:
      'Task-level simulation for planner training & eval. No physics, no robot time. Reskinnable per deployment.',
    plannerHeader: 'SYSTEM 01 // DELIBERATIVE PLANNER',
    executorHeader: 'SYSTEM 02 // STOCHASTIC EXECUTOR',
    environmentHeader: 'ENVIRONMENT // FOLD LINE',
  },
  instruction:
    'Process commercial laundry order: verify manifest count, unfold and fold garments, stack to height limit. Isolate damaged and foreign items.',
  itemAttributes: [
    { id: 'normal', label: 'Normal', chip: 'OK', normal: true },
    { id: 'delicate', label: 'Delicate', chip: 'DELICATE' },
    { id: 'damaged', label: 'Damaged', chip: 'DMG', hazard: true },
    { id: 'foreignItem', label: 'Foreign item', chip: 'FOREIGN', special: true, hazard: true },
  ],
  attributeWeights: {
    normal: 0.5,
    delicate: 0.2,
    damaged: 0.18,
    foreignItem: 0.12,
  },
  specialItemEpisodeRate: 0.5,
  skills: [
    { id: 'pick', label: 'pick', baseFailRate: 0.05, motor: true, role: 'pick' },
    { id: 'unfold', label: 'unfold', baseFailRate: 0.1, motor: true, role: 'prepare' },
    { id: 'fold', label: 'fold', baseFailRate: 0.28, motor: true, role: 'finish' },
    { id: 'stack', label: 'stack', baseFailRate: 0.09, motor: true, role: 'place' },
    { id: 'setAside', label: 'set-aside', baseFailRate: 0.04, motor: true, role: 'setAside' },
  ],
  containers: {
    label: 'STACK',
    labelPlural: 'STACKS',
    capacityMin: 5,
    capacityMax: 8,
    maxContainers: 2,
  },
  manifest: {
    label: 'ORDER MANIFEST',
    discrepancyMin: 0,
    discrepancyMax: 2,
  },
  itemCountMin: 6,
  itemCountMax: 10,
  skillFailJitter: 0.05,
  plannerRates: {
    baseline: {
      skipManifestVerify: 0.6,
      bagHazardItem: 0.3,
      missSpecialItem: 0.5,
      identicalRetryOnFail: 1.0,
      flagOnRepeatedFail: 0.15,
    },
    trained: {
      catchManifestMismatch: 0.95,
      setAsideHazard: 0.97,
      detectSpecialItem: 0.95,
      recoverySuccess: 0.9,
      redundantReinspectEpisode: 0.15,
      hazardGateAfterSpecialMiss: 0,
    },
  },
  timing: {
    streamDelayMs: 150,
    fastMultiplier: 4,
  },
  batch: {
    episodes: 100,
  },
  ui: {
    itemLabel: 'GARMENT',
    itemLabelPlural: 'GARMENTS',
  },
};
