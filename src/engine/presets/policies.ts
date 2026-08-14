import type { EpisodeState, TaskConfig } from '../../types';
import type { LlmActionJson } from '../planner/llm';
import { activeContainer, getAttr, skillByRole } from '../episode';
import {
  hasOrders,
  inboundRemaining,
  isForeignObject,
  matchingOrderContainer,
  unmetOrderLines,
} from '../fulfillment';

function placeSkill(config: TaskConfig): string {
  return skillByRole(config, 'place')?.id ?? 'bag';
}
function pickSkill(config: TaskConfig): string {
  return skillByRole(config, 'pick')?.id ?? 'pick';
}
function prepareSkill(config: TaskConfig): string | undefined {
  return skillByRole(config, 'prepare')?.id;
}
function finishSkill(config: TaskConfig): string | undefined {
  return skillByRole(config, 'finish')?.id;
}
function asideSkill(config: TaskConfig): string {
  return skillByRole(config, 'setAside')?.id ?? 'setAside';
}

function unresolved(state: EpisodeState) {
  const visible = new Set(state.visibleItemIds);
  return state.seedData.items.filter((it) => {
    if (state.seedData.streamEnabled && !visible.has(it.id)) return false;
    const p = state.itemPhase[it.id];
    return p !== 'placed' && p !== 'aside';
  });
}

function didKind(state: EpisodeState, kind: string): boolean {
  return state.actions.some((a) => a.kind === kind);
}

function failStreak(state: EpisodeState, itemId: string, skillId: string): number {
  return state.failCounts[`${skillId}:${itemId}`] ?? 0;
}

function nextPipeline(
  state: EpisodeState,
  config: TaskConfig,
  itemId: string,
  reason: string,
): LlmActionJson {
  const phase = state.itemPhase[itemId];
  const last = state.actions[state.actions.length - 1];
  if (
    last &&
    !last.success &&
    last.motor &&
    last.itemId === itemId &&
    last.skillId
  ) {
    const streak = failStreak(state, itemId, last.skillId);
    if (streak >= 2) {
      return {
        action: 'placeIncomplete',
        skillId: placeSkill(config),
        itemId,
        containerId: activeContainer(state).id,
        flagIncomplete: true,
        reason: `${reason}: repeated fail — flag incomplete`,
      };
    }
    return {
      action: 'reposition',
      skillId: last.skillId,
      itemId,
      reason: `${reason}: reposition after fail`,
    };
  }

  if (phase === 'raw') {
    return {
      action: 'pick',
      skillId: pickSkill(config),
      itemId,
      reason: `${reason}: pick`,
    };
  }
  if (phase === 'picked' && prepareSkill(config)) {
    return {
      action: 'prepare',
      skillId: prepareSkill(config),
      itemId,
      reason: `${reason}: prepare`,
    };
  }
  if (
    (phase === 'picked' || phase === 'prepared') &&
    finishSkill(config) &&
    !(phase === 'picked' && prepareSkill(config))
  ) {
    return {
      action: 'finish',
      skillId: finishSkill(config),
      itemId,
      reason: `${reason}: finish`,
    };
  }
  const dest =
    hasOrders(config)
      ? matchingOrderContainer(
          state,
          config,
          state.beliefs.find((b) => b.itemId === itemId)?.believedType ??
            state.seedData.items.find((i) => i.id === itemId)?.trueType ??
            null,
        )
      : activeContainer(state);
  const c = dest ?? activeContainer(state);
  if (c.itemIds.length >= c.capacity) {
    return {
      action: 'openContainer',
      orderId: c.orderId,
      reason: `${reason}: open container`,
    };
  }
  return {
    action: 'place',
    skillId: placeSkill(config),
    itemId,
    containerId: c.id,
    reason: `${reason}: place`,
  };
}

export function nextPerfectAction(
  state: EpisodeState,
  config: TaskConfig,
): LlmActionJson | null {
  if (state.done) return null;
  if (!didKind(state, 'checkManifest')) {
    return { action: 'checkManifest', reason: 'perfect: verify ticket' };
  }
  if (!state.beliefs.some((b) => b.inspected)) {
    return { action: 'reInspect', reason: 'perfect: inspect' };
  }
  const left = unresolved(state);
  if (left.length === 0) {
    if (inboundRemaining(state) > 0) {
      return { action: 'reInspect', reason: 'perfect: wait for next arrival' };
    }
    if (hasOrders(config) && unmetOrderLines(state).length > 0) {
      return {
        action: 'escalate',
        flagShortShip: true,
        reason: 'perfect: flag short-ship',
      };
    }
    return { action: 'escalate', reason: 'perfect: complete' };
  }
  const target = left[0]!;
  const attr = getAttr(config, target.attributeId);
  if (attr.hazard || attr.special || isForeignObject(config, target)) {
    const last = state.actions[state.actions.length - 1];
    if (last && !last.success && last.itemId === target.id && last.skillId) {
      return nextPipeline(state, config, target.id, 'perfect');
    }
    return {
      action: 'setAside',
      skillId: asideSkill(config),
      itemId: target.id,
      reason: 'perfect: exception set-aside',
    };
  }
  const c = activeContainer(state);
  if (
    c.itemIds.length >= c.capacity &&
    state.containers.length < config.containers.maxContainers &&
    state.itemPhase[target.id] === 'finished'
  ) {
    return { action: 'openContainer', reason: 'perfect: split container' };
  }
  return nextPipeline(state, config, target.id, 'perfect');
}

export function nextNegligentAction(
  state: EpisodeState,
  config: TaskConfig,
): LlmActionJson | null {
  if (state.done) return null;
  const left = unresolved(state);
  if (left.length === 0) {
    return { action: 'escalate', reason: 'negligent: done' };
  }
  const target = left[0]!;
  const c = activeContainer(state);
  if (
    c.itemIds.length >= c.capacity &&
    state.containers.length < config.containers.maxContainers
  ) {
    // force-place anyway to violate capacity when already at max; otherwise open
    if (state.containers.length >= config.containers.maxContainers) {
      return {
        action: 'placeIncomplete',
        skillId: placeSkill(config),
        itemId: target.id,
        containerId: c.id,
        flagIncomplete: false,
        reason: 'negligent: force-place over capacity',
      };
    }
  }
  return {
    action: 'placeIncomplete',
    skillId: placeSkill(config),
    itemId: target.id,
    containerId: c.id,
    flagIncomplete: false,
    reason: 'negligent: skip verify, force-place unflagged',
  };
}

export function nextRecoveryAction(
  state: EpisodeState,
  config: TaskConfig,
): LlmActionJson | null {
  if (state.done) return null;
  if (!didKind(state, 'checkManifest')) {
    return { action: 'checkManifest', reason: 'recovery: verify ticket' };
  }
  if (!state.beliefs.some((b) => b.inspected)) {
    return { action: 'reInspect', reason: 'recovery: inspect' };
  }

  const focus =
    state.seedData.items.find((it) => {
      const attr = getAttr(config, it.attributeId);
      const p = state.itemPhase[it.id];
      return !attr.hazard && !attr.special && p !== 'placed' && p !== 'aside';
    }) ?? unresolved(state)[0];

  if (!focus) {
    if (inboundRemaining(state) > 0) {
      return { action: 'reInspect', reason: 'recovery: wait for next arrival' };
    }
    if (hasOrders(config) && unmetOrderLines(state).length > 0) {
      return {
        action: 'escalate',
        flagShortShip: true,
        reason: 'recovery: flag short-ship',
      };
    }
    return { action: 'escalate', reason: 'recovery: complete' };
  }

  const finish = finishSkill(config) ?? pickSkill(config);
  const streak = Math.max(
    failStreak(state, focus.id, finish),
    state.maxFailStreak[focus.id] ?? 0,
  );
  const last = state.actions[state.actions.length - 1];

  const stillWorking = state.itemPhase[focus.id] !== 'placed' &&
    state.itemPhase[focus.id] !== 'aside';

  if (stillWorking && streak >= 2) {
    return {
      action: 'placeIncomplete',
      skillId: placeSkill(config),
      itemId: focus.id,
      containerId: activeContainer(state).id,
      flagIncomplete: true,
      reason: 'recovery: flag after repeated failure',
    };
  }

  if (
    stillWorking &&
    last &&
    !last.success &&
    last.motor &&
    last.itemId === focus.id &&
    last.skillId
  ) {
    return {
      action: 'reposition',
      skillId: last.skillId,
      itemId: focus.id,
      reason: 'recovery: reposition to accumulate / recover',
    };
  }

  // Drive finish skill to harvest motor failures (fold has high base fail).
  if (stillWorking && finishSkill(config)) {
    const phase = state.itemPhase[focus.id];
    if (phase === 'raw') {
      return {
        action: 'pick',
        skillId: pickSkill(config),
        itemId: focus.id,
        reason: 'recovery: pick focus item',
      };
    }
    if (phase === 'picked' && prepareSkill(config)) {
      return {
        action: 'prepare',
        skillId: prepareSkill(config),
        itemId: focus.id,
        reason: 'recovery: prepare',
      };
    }
    if (phase === 'picked' || phase === 'prepared') {
      return {
        action: 'finish',
        skillId: finish,
        itemId: focus.id,
        reason: 'recovery: attempt finish (failure-prone)',
      };
    }
  }

  const attr = getAttr(config, focus.attributeId);
  if (attr.hazard || attr.special) {
    return {
      action: 'setAside',
      skillId: asideSkill(config),
      itemId: focus.id,
      reason: 'recovery: set aside exception',
    };
  }
  return nextPipeline(state, config, focus.id, 'recovery');
}
