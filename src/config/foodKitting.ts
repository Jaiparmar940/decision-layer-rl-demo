import type { TaskConfig } from '../types';
import { DEFAULT_SCORING } from './scoring';

export const foodKittingConfig: TaskConfig = {
  meta: {
    id: 'foodKitting',
    title: 'FOOD MANUFACTURING: COMPONENT KITTING',
    domainLabel: 'FOOD MANUFACTURING: COMPONENT KITTING',
    footerOneLiner:
      'Task-level simulation for planner training & eval. No physics, no robot time. Neutral vocabulary for reskin.',
    plannerHeader: 'SYSTEM 01 // DELIBERATIVE PLANNER',
    executorHeader: 'SYSTEM 02 // STOCHASTIC EXECUTOR',
    environmentHeader: 'ENVIRONMENT // COMPONENT KITTING',
  },
  instruction:
    'Kit concurrent SKU runs from a mixed inbound stream. Confirm component type by handling before place — standard vs GF sachets and standard vs low-sodium seasoning are confusable. Set aside glove fragments, desiccant packets, and leaking sachets. Flag depleted bins for refill.',
  itemAttributes: [
    { id: 'normal', label: 'Normal', chip: 'OK', normal: true },
    {
      id: 'damaged',
      label: 'Leaking / damaged sachet',
      chip: 'LEAK',
      hazard: true,
      hazardClass: 'condition',
    },
    {
      id: 'gloveFragment',
      label: 'Glove fragment',
      chip: 'GLOVE',
      hazard: true,
      hazardClass: 'foreignObject',
    },
    {
      id: 'desiccant',
      label: 'Desiccant packet',
      chip: 'DESICCANT',
      hazard: true,
      hazardClass: 'foreignObject',
    },
  ],
  attributeWeights: {
    normal: 0.64,
    damaged: 0.16,
    gloveFragment: 0.1,
    desiccant: 0.1,
  },
  specialItemEpisodeRate: 0,
  foreignObjectEpisodeRate: 0.55,
  itemTypes: [
    { id: 'sauceSachet', label: 'sauce sachet', foldProfile: 'sachet' },
    { id: 'gfSauceSachet', label: 'GF sauce sachet', foldProfile: 'sachet' },
    { id: 'seasoningStd', label: 'standard seasoning', foldProfile: 'seasoning' },
    { id: 'seasoningLowNa', label: 'low-sodium seasoning', foldProfile: 'seasoning' },
    { id: 'cutleryKit', label: 'cutlery kit', foldProfile: 'cutlery' },
    { id: 'garnishTopper', label: 'garnish topper', foldProfile: 'garnish' },
    { id: 'driedProtein', label: 'dried protein', foldProfile: 'protein' },
  ],
  typeConfusion: {
    sauceSachet: { sauceSachet: 0.85, gfSauceSachet: 0.15 },
    gfSauceSachet: { gfSauceSachet: 0.85, sauceSachet: 0.15 },
    seasoningStd: { seasoningStd: 0.85, seasoningLowNa: 0.15 },
    seasoningLowNa: { seasoningLowNa: 0.85, seasoningStd: 0.15 },
    cutleryKit: { cutleryKit: 1 },
    garnishTopper: { garnishTopper: 1 },
    driedProtein: { driedProtein: 1 },
  },
  orders: [
    {
      id: 'RAMEN-CLASSIC',
      label: 'RAMEN-CLASSIC',
      lines: [
        { typeId: 'seasoningStd', count: 3 },
        { typeId: 'sauceSachet', count: 2 },
        { typeId: 'cutleryKit', count: 2 },
      ],
      containers: [
        {
          id: 'ramen-classic-seasoning',
          label: 'RAMEN-CLASSIC seasoning compartment',
          capacity: 6,
          foldProfile: 'seasoning',
        },
        {
          id: 'ramen-classic-sauce',
          label: 'RAMEN-CLASSIC sauce compartment',
          capacity: 6,
          foldProfile: 'sachet',
        },
        {
          id: 'ramen-classic-cutlery',
          label: 'RAMEN-CLASSIC cutlery compartment',
          capacity: 6,
          foldProfile: 'cutlery',
        },
      ],
    },
    {
      id: 'MEALKIT-GF',
      label: 'MEALKIT-GF',
      dietRestricted: true,
      lines: [
        { typeId: 'gfSauceSachet', count: 3 },
        { typeId: 'garnishTopper', count: 2 },
        { typeId: 'cutleryKit', count: 2 },
      ],
      containers: [
        {
          id: 'mealkit-gf-sauce',
          label: 'MEALKIT-GF sauce compartment',
          capacity: 6,
          foldProfile: 'sachet',
        },
        {
          id: 'mealkit-gf-garnish',
          label: 'MEALKIT-GF garnish compartment',
          capacity: 6,
          foldProfile: 'garnish',
        },
        {
          id: 'mealkit-gf-cutlery',
          label: 'MEALKIT-GF cutlery compartment',
          capacity: 6,
          foldProfile: 'cutlery',
        },
      ],
    },
    {
      id: 'MEDICAL-LOWNA',
      label: 'MEDICAL-LOWNA',
      dietRestricted: true,
      lines: [
        { typeId: 'seasoningLowNa', count: 4 },
        { typeId: 'driedProtein', count: 2 },
      ],
      containers: [
        {
          id: 'medical-lowna-seasoning',
          label: 'MEDICAL-LOWNA seasoning compartment',
          capacity: 6,
          foldProfile: 'seasoning',
        },
        {
          id: 'medical-lowna-protein',
          label: 'MEDICAL-LOWNA protein compartment',
          capacity: 6,
          foldProfile: 'protein',
        },
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
    label: 'BIN',
    labelPlural: 'BINS',
    capacityMin: 5,
    capacityMax: 8,
    maxContainers: 12,
  },
  manifest: {
    label: 'SKU TICKETS',
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
    itemLabel: 'COMPONENT',
    itemLabelPlural: 'COMPONENTS',
    shortFlagAsRefill: true,
  },
  scoring: {
    ...DEFAULT_SCORING,
    parSteps: 72,
    safetyPenalties: {
      ...DEFAULT_SCORING.safetyPenalties,
      foreignObjectContainerized: 20,
      // Diet/allergen misroute (standard sachet into GF or low-sodium run).
      crossOrder: 25,
    },
  },
};
