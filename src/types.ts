export type PolicyMode = 'baseline' | 'trained';

export type ActionKind =
  | 'checkManifest'
  | 'reInspect'
  | 'escalate'
  | 'openContainer'
  | 'pick'
  | 'prepare'
  | 'finish'
  | 'place'
  | 'setAside'
  | 'reposition'
  | 'placeIncomplete';

export interface ItemAttributeDef {
  id: string;
  label: string;
  chip: string;
  /** If true, item must not enter a guest/output container */
  hazard?: boolean;
  /** Special property (hotel logo / foreign item) — detect & set aside */
  special?: boolean;
  /** Default / benign attribute */
  normal?: boolean;
}

export interface SkillDef {
  id: string;
  label: string;
  baseFailRate: number;
  motor: boolean;
  /** Role in the pipeline: pick → prepare → finish → place */
  role: 'pick' | 'prepare' | 'finish' | 'place' | 'setAside' | 'other';
}

export interface PlannerRatesBaseline {
  skipManifestVerify: number;
  bagHazardItem: number;
  missSpecialItem: number;
  identicalRetryOnFail: number;
}

export interface PlannerRatesTrained {
  catchManifestMismatch: number;
  setAsideHazard: number;
  detectSpecialItem: number;
  recoverySuccess: number;
  redundantReinspectEpisode: number;
}

export interface TaskConfig {
  meta: {
    id: string;
    title: string;
    domainLabel: string;
    footerOneLiner: string;
    plannerHeader: string;
    executorHeader: string;
    environmentHeader: string;
  };
  instruction: string;
  itemAttributes: ItemAttributeDef[];
  /** Weights for sampling non-normal attributes (relative) */
  attributeWeights: Record<string, number>;
  /** Probability an episode includes at least one special item */
  specialItemEpisodeRate: number;
  skills: SkillDef[];
  containers: {
    label: string;
    labelPlural: string;
    capacityMin: number;
    capacityMax: number;
    maxContainers: number;
  };
  manifest: {
    label: string;
    discrepancyMin: number;
    discrepancyMax: number;
  };
  itemCountMin: number;
  itemCountMax: number;
  skillFailJitter: number;
  plannerRates: {
    baseline: PlannerRatesBaseline;
    trained: PlannerRatesTrained;
  };
  timing: {
    streamDelayMs: number;
    fastMultiplier: number;
  };
  batch: {
    episodes: number;
  };
  ui: {
    itemLabel: string;
    itemLabelPlural: string;
  };
}

export interface Item {
  id: string;
  index: number;
  attributeId: string;
  label: string;
}

export interface Container {
  id: string;
  capacity: number;
  itemIds: string[];
}

export interface SkillRuntime {
  id: string;
  failRate: number;
}

export interface EpisodeSeedData {
  masterSeed: number;
  episodeId: string;
  items: Item[];
  manifestClaimed: number;
  containerCapacity: number;
  skills: SkillRuntime[];
  hasManifestMismatch: boolean;
  hasSpecialItem: boolean;
  hasHazardItem: boolean;
}

export interface ItemBelief {
  itemId: string;
  attributeId: string | null;
  inspected: boolean;
}

export interface EpisodeFlags {
  manifestChecked: boolean;
  manifestMismatchCaught: boolean;
  escalated: boolean;
  recoveryAttempted: boolean;
  recoverySucceeded: boolean;
  hadExecutorFailure: boolean;
  capacityViolated: boolean;
  hazardBaggedCount: number;
  specialMisbagged: boolean;
  openedSecondContainer: boolean;
}

export type TraceChannel = 'planner' | 'executor' | 'system';

export interface TraceLine {
  id: string;
  channel: TraceChannel;
  text: string;
  step?: number;
}

export interface ActionRecord {
  step: number;
  kind: ActionKind;
  skillId?: string;
  itemId?: string | null;
  success: boolean;
  motor: boolean;
  observation?: string;
}

export interface EpisodeState {
  seedData: EpisodeSeedData;
  mode: PolicyMode;
  beliefs: ItemBelief[];
  containers: Container[];
  setAsideIds: string[];
  heldItemId: string | null;
  itemPhase: Record<string, 'raw' | 'picked' | 'prepared' | 'finished' | 'placed' | 'aside'>;
  flags: EpisodeFlags;
  step: number;
  done: boolean;
  actions: ActionRecord[];
  plannerLines: TraceLine[];
  executorLines: TraceLine[];
  pendingItemQueue: string[];
  failCounts: Record<string, number>;
  lastFailKey: string | null;
}

export interface Scorecard {
  manifestMismatchPresent: boolean;
  manifestMismatchCaught: boolean;
  hazardBaggedCount: number;
  specialPresent: boolean;
  specialMisbagged: boolean;
  capacityViolated: boolean;
  hadExecutorFailure: boolean;
  recoverySucceeded: boolean;
  totalSteps: number;
  escalated: boolean;
}

export interface EpisodeResult {
  state: EpisodeState;
  score: Scorecard;
  plannerLines: TraceLine[];
  executorLines: TraceLine[];
}

export interface MetricValue {
  numerator: number;
  denominator: number;
  /** null when denominator is 0 */
  rate: number | null;
  label: string;
  denomLabel: string;
}

export interface PolicyMetrics {
  mode: PolicyMode;
  episodes: number;
  manifestMismatchCaught: MetricValue;
  hazardBaggedEpisodes: MetricValue;
  specialMisbagged: MetricValue;
  capacityViolated: MetricValue;
  recoverySuccess: MetricValue;
  meanSteps: number;
  escalateRate: MetricValue;
}

export interface BatchResult {
  baseline: PolicyMetrics;
  trained: PolicyMetrics;
  episodesPerSec: number;
  wallMs: number;
  episodeCount: number;
}
