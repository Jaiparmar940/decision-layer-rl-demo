import type { TaskConfig } from '../types';
import { DEFAULT_SCORING } from './scoring';

export const genericFulfillmentConfig: TaskConfig = {
  meta: {
    id: 'genericFulfillment',
    title: 'FULFILLMENT: MIXED INBOUND TO ORDERS',
    domainLabel: 'FULFILLMENT: MIXED INBOUND TO ORDERS',
    footerOneLiner:
      'Task-level simulation for planner training & eval. No physics, no robot time. Neutral vocabulary for reskin.',
    plannerHeader: 'SYSTEM 01 // DELIBERATIVE PLANNER',
    executorHeader: 'SYSTEM 02 // STOCHASTIC EXECUTOR',
    environmentHeader: 'ENVIRONMENT // SORT-TO-ORDER',
  },
  instruction:
    'Fulfill concurrent orders from a mixed inbound stream. Confirm SKU by handling before place. Set aside damaged and foreign objects. Flag short lines.',
  itemAttributes: [
    { id: 'normal', label: 'Normal', chip: 'OK', normal: true },
    { id: 'damaged', label: 'Damaged', chip: 'DMG', hazard: true, hazardClass: 'condition' },
    { id: 'stained', label: 'Stained', chip: 'STAIN', hazard: true, hazardClass: 'condition' },
    {
      id: 'foreign',
      label: 'Foreign object',
      chip: 'FOREIGN',
      hazard: true,
      hazardClass: 'foreignObject',
    },
  ],
  attributeWeights: {
    normal: 0.64,
    damaged: 0.16,
    stained: 0.14,
    foreign: 0.06,
  },
  specialItemEpisodeRate: 0,
  foreignObjectEpisodeRate: 0.55,
  itemTypes: [
    { id: 'skuA', label: 'SKU-A', foldProfile: 'A' },
    { id: 'skuB', label: 'SKU-B', foldProfile: 'B' },
    { id: 'skuC', label: 'SKU-C', foldProfile: 'A' },
    { id: 'skuD', label: 'SKU-D', foldProfile: 'C' },
  ],
  typeConfusion: {
    skuA: { skuA: 0.85, skuB: 0.15 },
    skuB: { skuB: 0.85, skuA: 0.15 },
    skuC: { skuC: 1 },
    skuD: { skuD: 1 },
  },
  orders: [
    {
      id: 'ORDER-1',
      label: 'ORDER-1',
      lines: [
        { typeId: 'skuA', count: 3 },
        { typeId: 'skuB', count: 2 },
      ],
      containers: [
        { id: 'order-1-a', label: 'ORDER-1 tote A', capacity: 6, foldProfile: 'A' },
        { id: 'order-1-b', label: 'ORDER-1 tote B', capacity: 6, foldProfile: 'B' },
      ],
    },
    {
      id: 'ORDER-2',
      label: 'ORDER-2',
      lines: [
        { typeId: 'skuC', count: 3 },
        { typeId: 'skuB', count: 2 },
      ],
      containers: [
        { id: 'order-2-a', label: 'ORDER-2 tote A', capacity: 6, foldProfile: 'A' },
        { id: 'order-2-b', label: 'ORDER-2 tote B', capacity: 6, foldProfile: 'B' },
      ],
    },
    {
      id: 'ORDER-3',
      label: 'ORDER-3',
      lines: [
        { typeId: 'skuD', count: 4 },
        { typeId: 'skuA', count: 2 },
      ],
      containers: [
        { id: 'order-3-c', label: 'ORDER-3 tote C', capacity: 6, foldProfile: 'C' },
        { id: 'order-3-a', label: 'ORDER-3 tote A', capacity: 4, foldProfile: 'A' },
      ],
    },
  ],
  ordersPerEpisode: { min: 2, max: 3 },
  arrivalStream: { enabled: true, batchSizeMin: 2, batchSizeMax: 3 },
  qualityGate: { uniformStack: true },
  shortShip: { shortEpisodeRate: 0.25, maxShort: 2 },
  skills: [
    { id: 'pick', label: 'pick', baseFailRate: 0.05, motor: true, role: 'pick' },
    { id: 'prep', label: 'prep', baseFailRate: 0.1, motor: true, role: 'prepare' },
    { id: 'pack', label: 'pack', baseFailRate: 0.09, motor: true, role: 'place' },
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
    label: 'ORDER LINES',
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
      flagOnRepeatedFail: 0.15,
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
    itemLabel: 'SKU',
    itemLabelPlural: 'SKUS',
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
