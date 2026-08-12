import type { EpisodeState, TaskConfig } from '../../types';
import * as T from '../../copy/traces';
import {
  activeContainer,
  beliefAttr,
  getAttr,
  getItem,
  skillByRole,
  trueAttr,
} from '../episode';
import type { PlannerAction, PlannerEpisodeContext } from './types';

export function itemCtx(state: EpisodeState, config: TaskConfig, itemId: string) {
  const item = getItem(state, itemId);
  const attrId = trueAttr(state, itemId);
  const attr = getAttr(config, attrId);
  return {
    itemLabel: item.label,
    attributeChip: attr.chip,
    attributeId: attrId,
    index: item.index,
  };
}

export function believedItemCtx(
  state: EpisodeState,
  config: TaskConfig,
  itemId: string,
) {
  const item = getItem(state, itemId);
  const attrId = beliefAttr(state, config, itemId);
  const attr = getAttr(config, attrId);
  return {
    itemLabel: item.label,
    attributeChip: attr.chip,
    attributeId: attrId,
    index: item.index,
  };
}

export function emitGroundAndPlan(
  state: EpisodeState,
  config: TaskConfig,
  ctx: PlannerEpisodeContext,
): string[] {
  if (ctx.planEmitted) return [];
  ctx.planEmitted = true;
  const lines: string[] = [
    T.groundInstruction({
      instruction: config.instruction,
      itemCount: state.seedData.items.length,
      manifestLabel: config.manifest.label,
      domainLabel: config.meta.domainLabel,
      mode: state.mode,
    }),
    T.decomposeHeader(),
  ];
  let n = 1;
  lines.push(
    T.decomposeStep({
      n: n++,
      action: `verify ${config.manifest.label}`,
    }),
  );
  lines.push(T.decomposeStep({ n: n++, action: 're-inspect workspace' }));
  for (const it of state.seedData.items) {
    lines.push(
      T.decomposeStep({
        n: n++,
        action: 'process',
        target: it.label,
      }),
    );
  }
  lines.push(
    T.decomposeStep({
      n: n++,
      action: `seal ${config.containers.labelPlural.toLowerCase()} / complete`,
    }),
  );
  return lines;
}

export function nextRawItem(state: EpisodeState): string | null {
  for (const id of state.pendingItemQueue) {
    const phase = state.itemPhase[id];
    if (phase === 'raw' || phase === 'picked' || phase === 'prepared' || phase === 'finished') {
      return id;
    }
  }
  // fallback scan
  for (const it of state.seedData.items) {
    const phase = state.itemPhase[it.id];
    if (phase !== 'placed' && phase !== 'aside') return it.id;
  }
  return null;
}

export function needsCapacitySplit(state: EpisodeState, config: TaskConfig): boolean {
  const c = activeContainer(state);
  const remaining = state.seedData.items.filter(
    (it) => state.itemPhase[it.id] !== 'placed' && state.itemPhase[it.id] !== 'aside',
  ).length;
  return (
    c.itemIds.length >= c.capacity &&
    remaining > 0 &&
    state.containers.length < config.containers.maxContainers
  );
}

export function skillIdForRole(config: TaskConfig, role: string): string | undefined {
  return skillByRole(config, role)?.id;
}

export function pipelineRoles(config: TaskConfig): Array<'pick' | 'prepare' | 'finish' | 'place'> {
  const roles: Array<'pick' | 'prepare' | 'finish' | 'place'> = ['pick'];
  if (skillByRole(config, 'prepare')) roles.push('prepare');
  if (skillByRole(config, 'finish')) roles.push('finish');
  roles.push('place');
  return roles;
}

export function nextMotorForItem(
  state: EpisodeState,
  config: TaskConfig,
  itemId: string,
): PlannerAction | null {
  const phase = state.itemPhase[itemId]!;
  const ic = believedItemCtx(state, config, itemId);

  if (phase === 'raw') {
    const sid = skillIdForRole(config, 'pick')!;
    return {
      kind: 'pick',
      skillId: sid,
      itemId,
      plannerLines: [
        T.processItemLine(ic),
        T.verifyLine({
          step: state.step + 1,
          action: config.skills.find((s) => s.id === sid)!.label,
          itemLabel: ic.itemLabel,
          attributeChip: ic.attributeChip,
          success: true,
          note: 'dispatch',
        }),
      ],
    };
  }

  if (phase === 'picked' && skillByRole(config, 'prepare')) {
    const sid = skillIdForRole(config, 'prepare')!;
    return {
      kind: 'prepare',
      skillId: sid,
      itemId,
      plannerLines: [
        T.verifyLine({
          step: state.step + 1,
          action: config.skills.find((s) => s.id === sid)!.label,
          itemLabel: ic.itemLabel,
          success: true,
          note: 'dispatch',
        }),
      ],
    };
  }

  if (
    (phase === 'picked' || phase === 'prepared') &&
    skillByRole(config, 'finish') &&
    !(phase === 'picked' && skillByRole(config, 'prepare'))
  ) {
    const sid = skillIdForRole(config, 'finish')!;
    return {
      kind: 'finish',
      skillId: sid,
      itemId,
      plannerLines: [
        T.verifyLine({
          step: state.step + 1,
          action: config.skills.find((s) => s.id === sid)!.label,
          itemLabel: ic.itemLabel,
          success: true,
          note: 'dispatch',
        }),
      ],
    };
  }

  if (phase === 'finished' || (phase === 'prepared' && !skillByRole(config, 'finish')) || (phase === 'picked' && !skillByRole(config, 'prepare') && !skillByRole(config, 'finish'))) {
    const sid = skillIdForRole(config, 'place')!;
    return {
      kind: 'place',
      skillId: sid,
      itemId,
      plannerLines: [
        T.verifyLine({
          step: state.step + 1,
          action: config.skills.find((s) => s.id === sid)!.label,
          itemLabel: ic.itemLabel,
          success: true,
          note: 'dispatch',
        }),
      ],
    };
  }

  return null;
}

export function setAsideAction(
  state: EpisodeState,
  config: TaskConfig,
  itemId: string,
  reason: string,
): PlannerAction {
  const ic = itemCtx(state, config, itemId);
  const sid = skillIdForRole(config, 'setAside')!;
  return {
    kind: 'setAside',
    skillId: sid,
    itemId,
    plannerLines: [
      T.setAsideDecision({ ...ic, reason }),
      T.verifyLine({
        step: state.step + 1,
        action: 'set-aside',
        itemLabel: ic.itemLabel,
        attributeChip: ic.attributeChip,
        success: true,
        note: 'dispatch',
      }),
    ],
  };
}

export function doneAction(state: EpisodeState): PlannerAction {
  return {
    kind: 'escalate',
    plannerLines: [T.episodeComplete(state.step, state.mode)],
    meta: { forceDone: true },
  };
}
