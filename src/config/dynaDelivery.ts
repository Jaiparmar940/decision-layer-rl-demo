import type { TaskConfig } from '../types';
import { DEFAULT_SCORING } from './scoring';

export const dynaDeliveryConfig: TaskConfig = {
  meta: {
    id: 'dynaDelivery',
    title: 'COMMERCIAL LAUNDRY: DRYER TO DELIVERY',
    domainLabel: 'COMMERCIAL LAUNDRY: DRYER TO DELIVERY',
    footerOneLiner:
      'Task-level simulation for planner training & eval. No physics, no robot time. Reskinnable per deployment.',
    plannerHeader: 'SYSTEM 01 // DELIBERATIVE PLANNER',
    executorHeader: 'SYSTEM 02 // STOCHASTIC EXECUTOR',
    environmentHeader: 'ENVIRONMENT // SORT-TO-ORDER',
  },
  instruction:
    'Sort mixed dryer output to concurrent hotel/airline orders. Confirm type by handling before place. Set aside damaged, stained, and foreign objects. Flag short lines.',
  itemAttributes: [
    { id: 'normal', label: 'Normal', chip: 'OK', normal: true },
    { id: 'damaged', label: 'Damaged', chip: 'DMG', hazard: true, hazardClass: 'condition' },
    { id: 'stained', label: 'Stained', chip: 'STAIN', hazard: true, hazardClass: 'condition' },
    {
      id: 'pen',
      label: 'Pen',
      chip: 'PEN',
      hazard: true,
      hazardClass: 'foreignObject',
    },
    {
      id: 'badge',
      label: 'Badge',
      chip: 'BADGE',
      hazard: true,
      hazardClass: 'foreignObject',
    },
  ],
  attributeWeights: {
    normal: 0.62,
    damaged: 0.16,
    stained: 0.14,
    pen: 0.04,
    badge: 0.04,
  },
  specialItemEpisodeRate: 0,
  foreignObjectEpisodeRate: 0.6,
  itemTypes: [
    { id: 'handTowel', label: 'Hand towel', foldProfile: 'small' },
    { id: 'bathTowel', label: 'Bath towel', foldProfile: 'large' },
    { id: 'poolTowel', label: 'Pool towel', foldProfile: 'large' },
    { id: 'apparel', label: 'Apparel', foldProfile: 'garment' },
  ],
  typeConfusion: {
    handTowel: { handTowel: 0.85, bathTowel: 0.15 },
    bathTowel: { bathTowel: 0.85, handTowel: 0.15 },
    poolTowel: { poolTowel: 1 },
    apparel: { apparel: 1 },
  },
  orders: [
    {
      id: 'HOTEL-A',
      label: 'HOTEL-A',
      lines: [
        { typeId: 'handTowel', count: 3 },
        { typeId: 'bathTowel', count: 2 },
      ],
      containers: [
        { id: 'hotel-a-small', label: 'HOTEL-A small', capacity: 6, foldProfile: 'small' },
        { id: 'hotel-a-large', label: 'HOTEL-A large', capacity: 6, foldProfile: 'large' },
      ],
    },
    {
      id: 'HOTEL-B',
      label: 'HOTEL-B',
      lines: [
        { typeId: 'poolTowel', count: 3 },
        { typeId: 'bathTowel', count: 2 },
      ],
      containers: [
        { id: 'hotel-b-large', label: 'HOTEL-B large', capacity: 8, foldProfile: 'large' },
      ],
    },
    {
      id: 'AIRLINE-C',
      label: 'AIRLINE-C',
      lines: [
        { typeId: 'apparel', count: 4 },
        { typeId: 'handTowel', count: 2 },
      ],
      containers: [
        { id: 'airline-c-garment', label: 'AIRLINE-C garment', capacity: 6, foldProfile: 'garment' },
        { id: 'airline-c-small', label: 'AIRLINE-C small', capacity: 4, foldProfile: 'small' },
      ],
    },
  ],
  ordersPerEpisode: { min: 2, max: 3 },
  arrivalStream: { enabled: true, batchSizeMin: 2, batchSizeMax: 3 },
  qualityGate: { uniformStack: true },
  shortShip: { shortEpisodeRate: 0.25, maxShort: 2 },
  skills: [
    { id: 'pick', label: 'pick', baseFailRate: 0.05, motor: true, role: 'pick' },
    { id: 'fold', label: 'fold', baseFailRate: 0.2, motor: true, role: 'finish' },
    { id: 'stack', label: 'stack', baseFailRate: 0.09, motor: true, role: 'place' },
    { id: 'setAside', label: 'set-aside', baseFailRate: 0.04, motor: true, role: 'setAside' },
  ],
  containers: {
    label: 'TOTE',
    labelPlural: 'TOTES',
    capacityMin: 5,
    capacityMax: 8,
    maxContainers: 12,
  },
  manifest: {
    label: 'ORDER TICKETS',
    discrepancyMin: 0,
    discrepancyMax: 2,
  },
  itemCountMin: 8,
  itemCountMax: 16,
  skillFailJitter: 0.05,
  plannerRates: {
    baseline: {
      skipManifestVerify: 0.6,
      bagHazardItem: 0.3,
      missSpecialItem: 0.5,
      identicalRetryOnFail: 1.0,
      flagOnRepeatedFail: 0.22,
    },
    trained: {
      catchManifestMismatch: 0.95,
      setAsideHazard: 0.97,
      detectSpecialItem: 0.95,
      recoverySuccess: 0.95,
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
    itemLabel: 'LINEN',
    itemLabelPlural: 'LINENS',
  },
  scoring: {
    ...DEFAULT_SCORING,
    parSteps: 72,
    safetyPenalties: {
      ...DEFAULT_SCORING.safetyPenalties,
      foreignObjectContainerized: 20,
      crossOrder: 15,
    },
  },
};
