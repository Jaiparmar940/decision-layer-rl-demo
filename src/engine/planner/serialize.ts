import type { ActionKind, EpisodeState, TaskConfig } from '../../types';
import { getAttr } from '../episode';

const ACTION_WINDOW = 15;

export const ACTION_KINDS: ActionKind[] = [
  'checkManifest',
  'reInspect',
  'escalate',
  'openContainer',
  'pick',
  'prepare',
  'finish',
  'place',
  'setAside',
  'reposition',
  'placeIncomplete',
];

export interface SerializedPlannerView {
  instruction: string;
  domainId: string;
  manifest: {
    label: string;
    claimedCount: number;
    /** Visible pile size — planner can count items on the table */
    visibleItemCount: number;
  };
  items: Array<{
    id: string;
    label: string;
    phase: string;
    /** Belief only — never ground-truth until inspected */
    believedAttribute: string | null;
    believedAttributeLabel: string | null;
    inspected: boolean;
    inContainer: boolean;
    setAside: boolean;
  }>;
  containers: Array<{
    id: string;
    fill: number;
    capacity: number;
    itemIds: string[];
  }>;
  heldItemId: string | null;
  availableActions: Array<{
    kind: ActionKind;
    semantics: string;
    skillIds?: string[];
  }>;
  lastExecutorObs: string | null;
  priorActions: Array<{
    step: number;
    kind: string;
    skillId?: string;
    itemId?: string | null;
    success: boolean;
    observation?: string;
  }>;
  step: number;
}

const ACTION_SEMANTICS: Record<ActionKind, string> = {
  checkManifest:
    'Compare claimed count on the ticket/manifest against the visible pile. Does not move items.',
  reInspect:
    'Visually re-inspect all items; updates believed attributes to what sensors report.',
  escalate:
    'Hand control to staff and park optional itemId aside. Use when policy requires human judgment.',
  openContainer:
    'Open an additional output container when the active one is full (respect max containers).',
  pick: 'Grasp an item (motor; may fail). Requires skillId + itemId.',
  prepare: 'Prepare/unfold an item (motor; may fail). Requires skillId + itemId.',
  finish: 'Finish/fold an item (motor; may fail). Requires skillId + itemId.',
  place: 'Place a finished item into the active container (motor; may fail).',
  setAside: 'Park an item outside guest/output containers (exceptions, hazards, specials).',
  reposition: 'Reposition and retry the same motor skill after a failure. Requires skillId + itemId.',
  placeIncomplete:
    'Force-place an incomplete item. Optional flagIncomplete:true to flag for staff review.',
};

/**
 * Planner-visible serialization. Never includes ground-truth attributes
 * for uninspected items.
 */
export function serializePlannerView(
  state: EpisodeState,
  config: TaskConfig,
): SerializedPlannerView {
  const inContainer = new Set(
    state.containers.flatMap((c) => c.itemIds),
  );
  const setAside = new Set(state.setAsideIds);

  const items = state.seedData.items.map((it) => {
    const belief = state.beliefs.find((b) => b.itemId === it.id);
    const inspected = Boolean(belief?.inspected);
    // Only expose attribute when inspected — otherwise unknown
    const believedId = inspected ? belief?.attributeId ?? null : null;
    const believedLabel =
      believedId != null ? getAttr(config, believedId).label : null;

    return {
      id: it.id,
      label: it.label,
      phase: state.itemPhase[it.id] ?? 'raw',
      believedAttribute: believedId,
      believedAttributeLabel: believedLabel,
      inspected,
      inContainer: inContainer.has(it.id),
      setAside: setAside.has(it.id),
    };
  });

  const skillIds = config.skills.map((s) => s.id);
  const motorKinds: ActionKind[] = [
    'pick',
    'prepare',
    'finish',
    'place',
    'setAside',
    'reposition',
    'placeIncomplete',
  ];

  const availableActions = ACTION_KINDS.map((kind) => ({
    kind,
    semantics: ACTION_SEMANTICS[kind],
    ...(motorKinds.includes(kind) ? { skillIds } : {}),
  }));

  const last = state.actions[state.actions.length - 1];
  const lastExecutorObs =
    last?.observation ??
    state.executorLines[state.executorLines.length - 1]?.text ??
    null;

  const priorActions = state.actions.slice(-ACTION_WINDOW).map((a) => ({
    step: a.step,
    kind: a.kind,
    skillId: a.skillId,
    itemId: a.itemId,
    success: a.success,
    observation: a.observation,
  }));

  return {
    instruction: config.instruction,
    domainId: config.meta.id,
    manifest: {
      label: config.manifest.label,
      claimedCount: state.seedData.manifestClaimed,
      visibleItemCount: state.seedData.items.length,
    },
    items,
    containers: state.containers.map((c) => ({
      id: c.id,
      fill: c.itemIds.length,
      capacity: c.capacity,
      itemIds: [...c.itemIds],
    })),
    heldItemId: state.heldItemId,
    availableActions,
    lastExecutorObs,
    priorActions,
    step: state.step,
  };
}

/** Compact JSON string for the user message. */
export function formatPlannerUserMessage(
  state: EpisodeState,
  config: TaskConfig,
): string {
  const view = serializePlannerView(state, config);
  return JSON.stringify(view, null, 2);
}

/**
 * Returns true if serialized text appears to leak a ground-truth attribute
 * that is not yet believed (for tests).
 */
export function serializedLeaksGroundTruth(
  state: EpisodeState,
  config: TaskConfig,
  serialized: string,
): string[] {
  const leaks: string[] = [];
  for (const it of state.seedData.items) {
    const belief = state.beliefs.find((b) => b.itemId === it.id);
    if (belief?.inspected) continue;
    const trueAttr = it.attributeId;
    const normalId =
      config.itemAttributes.find((a) => a.normal)?.id ?? 'normal';
    if (trueAttr === normalId) continue;
    // Ground-truth-only chip/label must not appear tied to this item before inspect
    const attr = getAttr(config, trueAttr);
    // Look for item id near the true attribute id in the same object-ish span
    const itemBlock = extractItemBlock(serialized, it.id);
    if (!itemBlock) continue;
    if (
      itemBlock.includes(`"believedAttribute": "${trueAttr}"`) ||
      itemBlock.includes(`"believedAttributeLabel": "${attr.label}"`)
    ) {
      leaks.push(`${it.id}:${trueAttr}`);
    }
  }
  return leaks;
}

function extractItemBlock(serialized: string, itemId: string): string | null {
  const idx = serialized.indexOf(`"id": "${itemId}"`);
  if (idx < 0) return null;
  return serialized.slice(idx, idx + 400);
}
