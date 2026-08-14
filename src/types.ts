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
  /**
   * Orthogonal hazard class. `foreignObject` = non-product in the stream
   * (must be set aside, never containerized). `crossOrder` is not an item
   * attribute — it is a placement event scored when an item is routed to
   * another order's container.
   */
  hazardClass?: 'condition' | 'foreignObject';
}

/** Product type — orthogonal to condition attributes. */
export interface ItemTypeDef {
  id: string;
  label: string;
  /** Physical fold/stack family; first placement commits a container to it. */
  foldProfile: string;
}

export interface OrderLineDef {
  typeId: string;
  count: number;
}

export interface OrderContainerDef {
  id?: string;
  label?: string;
  capacity?: number;
  /** If set, the tote starts committed to this fold/stack family. */
  foldProfile?: string;
}

export interface OrderDef {
  id: string;
  label: string;
  lines: OrderLineDef[];
  containers: OrderContainerDef[];
  /** If true, routing the wrong type here is a diet/allergen violation (trace copy). */
  dietRestricted?: boolean;
}

export interface ArrivalStreamConfig {
  enabled: boolean;
  /** Items admitted from the inbound queue per wave. */
  batchSizeMin: number;
  batchSizeMax: number;
}

export interface QualityGateConfig {
  /** Reject place when item foldProfile ≠ container's committed profile. */
  uniformStack: boolean;
}

export interface ShortShipConfig {
  /**
   * Probability the episode has a genuine short: drop 1–maxShort units
   * from exactly one randomly chosen order line. Default 0.25.
   */
  shortEpisodeRate: number;
  /** Max units dropped from that one line. */
  maxShort: number;
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

export interface ScoringWeights {
  completion: number;
  safety: number;
  verification: number;
  efficiency: number;
}

/** Per-class subtractors from the safety weight (floor 0). */
export interface SafetyPenalties {
  unflaggedIncomplete: number;
  hazardContainerized: number;
  specialMiscontainerized: number;
  capacityViolated: number;
  /** Optional; 0 when omitted so legacy configs keep their composite. */
  foreignObjectContainerized?: number;
  /** Optional; 0 when omitted. Cross-order (misrouted) placements. */
  crossOrder?: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  safetyPenalties: SafetyPenalties;
  /** Steps at or below this get full efficiency credit. */
  parSteps: number;
}

export interface CompositeComponents {
  completion: number;
  safety: number;
  verification: number;
  efficiency: number;
}

export interface CompositeScore {
  total: number;
  components: CompositeComponents;
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
    /** Short-ship traces use FLAG-REFILL / depleted-bin copy when true. */
    shortFlagAsRefill?: boolean;
  };
  /**
   * Deployment-tunable composite policy. Not a universal metric —
   * operators set weights/penalties per site. See README.
   */
  scoring: ScoringConfig;
  /**
   * Product types (SKU / linen class). Orthogonal to condition attributes.
   * Absent → single-manifest packaging (hospitality/folding degenerate case).
   */
  itemTypes?: ItemTypeDef[];
  /**
   * P(believedType = col | trueType = row). Missing row/col → identity.
   * Applied at arrival; corrected to truth only on pick/prepare, not reInspect.
   */
  typeConfusion?: Record<string, Record<string, number>>;
  /**
   * Concurrent orders with dedicated containers. Absent / empty → one
   * implicit order (existing single-manifest behavior).
   */
  orders?: OrderDef[];
  /** How many of `orders` to sample per episode. Default: all. */
  ordersPerEpisode?: { min: number; max: number };
  /** Mixed inbound stream. Absent / enabled:false → all items visible. */
  arrivalStream?: ArrivalStreamConfig;
  qualityGate?: QualityGateConfig;
  shortShip?: ShortShipConfig;
  /** Extra P(episode includes ≥1 foreignObject item) on top of the order-line stream. */
  foreignObjectEpisodeRate?: number;
  /**
   * P(episode includes extra condition-hazard items) added on top of the
   * order-line stream — never substituted for required units. Default 0.55.
   */
  hazardExtraEpisodeRate?: number;
}

export interface Item {
  id: string;
  index: number;
  attributeId: string;
  label: string;
  /** Ground-truth product type. null when the config has no itemTypes. */
  trueType: string | null;
  /**
   * Believed type assigned at arrival via the confusion matrix.
   * Immutable glance snapshot for misfold metrics; live belief is on ItemBelief.
   */
  glanceType: string | null;
  /** Order this linen was generated for. null for foreign objects / no-order configs. */
  destOrderId: string | null;
}

export interface Container {
  id: string;
  capacity: number;
  itemIds: string[];
  orderId?: string;
  label?: string;
  /** Fold profile committed by the first successful placement. */
  committedFoldProfile?: string | null;
}

export interface EpisodeOrderLine {
  typeId: string;
  /** Ticketed count. */
  count: number;
  /** How many items of this type were actually generated for this order. */
  supplied: number;
}

export interface EpisodeOrder {
  id: string;
  label: string;
  lines: EpisodeOrderLine[];
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
  orders: EpisodeOrder[];
  streamEnabled: boolean;
  streamBatchSize: number;
  /** FIFO inbound order (item ids). Identical across policy modes. */
  arrivalOrder: string[];
}

export interface ItemBelief {
  itemId: string;
  attributeId: string | null;
  inspected: boolean;
  believedType: string | null;
  /** True after pick/prepare — type glance noise is cleared. */
  typeConfirmed: boolean;
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
  /** Cross-order placements this episode */
  misroutedCount: number;
  foreignObjectContainerized: number;
  typeMisfoldCount: number;
  /** Escalate/flag with unmet order-line count (legal short-ship ending). */
  shortShipFlagged: boolean;
  /** Hold with unmet lines (legal short-ship ending). */
  shortShipHeld: boolean;
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
  /** Item ids not yet admitted from the inbound stream. */
  inboundQueue: string[];
  /** Item ids that have arrived (may be resolved). */
  visibleItemIds: string[];
  /** Each admit wave, in order. Seed-reproducible across modes. */
  arrivalBatches: string[][];
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
  /** Hazard items in the episode (denominator for hazardBaggedCount) */
  hazardItemCount: number;
  hazardBaggedCount: number;
  specialPresent: boolean;
  /** Special items in the episode (denominator for specialMisbagged) */
  specialItemCount: number;
  specialMisbagged: boolean;
  /** Special items that were containerized (for n/k display) */
  specialMisbaggedCount: number;
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
  /** Items present this episode (denominator for itemsResolved) */
  itemsPresent: number;
  /**
   * Items that ended in a legitimate terminal state:
   * containerized correctly / set aside correctly / flagged.
   */
  itemsResolved: number;
  /**
   * All items resolved AND episode ended via finish or a justified
   * escalate — not step cap, not abandonment.
   */
  taskCompleted: boolean;
  /** Cross-order placements (count) / items that had a dest order. */
  misroutedItemCount: number;
  misroutedItemDenom: number;
  foreignObjectContainerized: number;
  foreignObjectCount: number;
  typeMisfoldPlacements: number;
  typeMisfoldDenom: number;
  unflaggedShortShip: boolean;
  unflaggedShortShipLineCount: number;
  shortShipPresent: boolean;
  ordersCompletedCorrectly: number;
  ordersTotal: number;
  /** min(placed-correct, line.count) summed / ticketed line units. */
  orderLineUnitsFulfilled: number;
  orderLineUnitsTotal: number;
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
  /**
   * Always-present note so a 0 numerator cannot be read as virtue
   * when the denominator is 0 or the denom episodes were incomplete.
   */
  denomNote: string;
  /** How many denominator episodes had taskCompleted = false */
  incompleteInDenominator: number;
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
  /** Items in a legitimate terminal / items present (summed across episodes) */
  itemsResolved: MetricValue;
  /** Episodes that finished the task / all episodes */
  taskCompleted: MetricValue;
  /** Episodes that hit the step cap / all episodes */
  stepsExhausted: MetricValue;
  compositeMean: number;
  compositeStdev: number;
  compositeComponents: CompositeComponents;
  misroutedItems: MetricValue;
  foreignObjectContainerized: MetricValue;
  typeMisfoldPlacements: MetricValue;
  unflaggedShortShip: MetricValue;
  ordersCompletedCorrectly: MetricValue;
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
  /** Per-reason counts for invalid planner steps. */
  invalidActionHistogram?: {
    unparseable: number;
    unknown_kind: number;
    illegal_params: number;
    missing_target: number;
  };
  /** Truncated samples of invalid steps (adapter debugging). */
  invalidActionSamples?: Array<{
    raw: string;
    reason: string;
    detail: string;
    extractionPath: string;
  }>;
  meanSteps: number;
  meanTokensPerEpisode: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
    totalTokens: number;
  };
  totalCostEstimate: number;
  wallMs: number;
}
