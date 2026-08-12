import type { TaskConfig } from '../types';

export const hospitalityConfig: TaskConfig = {
  meta: {
    id: 'hospitality',
    title: 'DECISION-LAYER ENVIRONMENT // HOSPITALITY: GARMENT PACKAGING',
    domainLabel: 'HOSPITALITY: GARMENT PACKAGING',
    footerOneLiner:
      'Task-level simulation for planner training & eval. No physics, no robot time. Reskinnable per deployment.',
    plannerHeader: 'SYSTEM 01 // DELIBERATIVE PLANNER',
    executorHeader: 'SYSTEM 02 // STOCHASTIC EXECUTOR',
    environmentHeader: 'ENVIRONMENT // WORKCELL',
  },
  instruction:
    'Package guest laundry for room 1408: verify ticket, fold clean dry garments, bag for delivery. Set aside exceptions.',
  itemAttributes: [
    { id: 'normal', label: 'Normal', chip: 'OK', normal: true },
    { id: 'damp', label: 'Damp', chip: 'DAMP', hazard: true },
    { id: 'stained', label: 'Stained', chip: 'STAIN', hazard: true },
    { id: 'hotelLogo', label: 'Hotel property', chip: 'HOTEL', special: true },
  ],
  attributeWeights: {
    normal: 0.55,
    damp: 0.18,
    stained: 0.15,
    hotelLogo: 0.12,
  },
  specialItemEpisodeRate: 0.55,
  skills: [
    { id: 'pick', label: 'pick', baseFailRate: 0.06, motor: true, role: 'pick' },
    { id: 'fold', label: 'fold', baseFailRate: 0.28, motor: true, role: 'finish' },
    { id: 'bag', label: 'bag', baseFailRate: 0.08, motor: true, role: 'place' },
    { id: 'setAside', label: 'set-aside', baseFailRate: 0.04, motor: true, role: 'setAside' },
  ],
  containers: {
    label: 'BAG',
    labelPlural: 'BAGS',
    capacityMin: 5,
    capacityMax: 8,
    maxContainers: 2,
  },
  manifest: {
    label: 'LAUNDRY TICKET',
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
