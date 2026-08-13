export type PolicyMode = 'baseline' | 'trained' | 'llm';

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
  /** On ≥2 consecutive fails, P(flag incomplete place) instead of unflagged force-place */
  flagOnRepeatedFail: number;
}

export interface PlannerRatesTrained {
  catchManifestMismatch: number;
  setAsideHazard: number;
  detectSpecialItem: number;
  recoverySuccess: number;
  redundantReinspectEpisode: number;
  /**
   * When detectSpecialItem fails on a special that is also a hazard,
   * probability the hazard gate still catches it. Default 0 so misses propagate.
   */
  hazardGateAfterSpecialMiss: number;
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
  /** Set during run; final value computed in scoreEpisode */
  recoverySucceeded: boolean;
  hadExecutorFailure: boolean;
  capacityViolated: boolean;
  hazardBaggedCount: number;
  specialMisbagged: boolean;
  openedSecondContainer: boolean;
  /** placeIncomplete without flag/escalation */
  unflaggedIncompleteCount: number;
  /** placeIncomplete with flag */
  flaggedIncompleteCount: number;
  /** Escalated after repeated executor failure (recovery give-up) */
  recoveryGiveUp: boolean;
  /** Some item reached ≥2 consecutive motor fails */
  hadRepeatedFailure: boolean;
  /** LLM planner emitted illegal/unparseable action after retry */
  invalidActionCount: number;
  /** Episode ended because step cap was hit */
  stepsExhausted: boolean;
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
  containerId?: string;
  success: boolean;
  motor: boolean;
  observation?: string;
  /** Force-place / bag-unfolded path */
  placeIncomplete?: boolean;
  /** Incomplete place was flagged (trained bag-unfolded) */
  flagged?: boolean;
  /** Recovery residual: escalate instead of recovering */
  recoveryGiveUp?: boolean;
}

/** How each item was ultimately resolved (for recovery / safety scoring) */
export type ItemResolution =
  | 'pending'
  | 'normal'
  | 'retry_success'
  | 'flagged_incomplete'
  | 'unflagged_incomplete'
  | 'escalated_recovery'
  | 'set_aside';

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
  /** Peak consecutive motor fails per item id */
  maxFailStreak: Record<string, number>;
  itemResolution: Record<string, ItemResolution>;
  lastFailKey: string | null;
}

export interface Scorecard {
  manifestMismatchPresent: boolean;
  manifestMismatchCaught: boolean;
  hazardPresent: boolean;
  hazardBaggedCount: number;
  specialPresent: boolean;
  specialMisbagged: boolean;
  capacityViolated: boolean;
  hadExecutorFailure: boolean;
  recoverySucceeded: boolean;
  /** Count of unflagged force-place / bag-unfolded items this episode */
  unflaggedIncompleteCount: number;
  flaggedIncompleteCount: number;
  hadRepeatedFailure: boolean;
  /** Every repeated-fail item ended flagged, escalated, or resolved — never unflagged force-place */
  repeatedFailureHandledSafely: boolean;
  totalSteps: number;
  escalated: boolean;
  /** True when episode ended by hitting the step cap */
  stepsExhausted: boolean;
  invalidActionCount: number;
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
  /** Episodes with ≥1 unflagged incomplete placement / all episodes */
  unflaggedIncomplete: MetricValue;
  /** Repeated-fail episodes handled safely / episodes with ≥1 repeated failure */
  repeatedFailureSafety: MetricValue;
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

/**
 * Committed artifact from offline LLM eval (scripts/eval-llm.ts).
 * Loaded optionally by the dashboard — never produced client-side.
 */
export interface MeasuredRunResult {
  modelId: string;
  /** Short label for bars, e.g. "llama-3.1-8b" */
  modelShortName: string;
  domain: string;
  episodeCount: number;
  date: string;
  promptTemplateHash: string;
  metrics: PolicyMetrics;
  invalidActionCount: number;
  meanSteps: number;
  meanTokensPerEpisode: number;
  totalCostEstimate: number;
  wallMs: number;
}
