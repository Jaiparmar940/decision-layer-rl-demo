import type { ActionKind, EpisodeState, TaskConfig } from '../types';
import * as T from '../copy/traces';
import { getAttr, getItem, skillRuntime, trueAttr } from './episode';
import { chance, type Rng } from './rng';

export interface ExecRequest {
  kind: ActionKind;
  skillId?: string;
  itemId?: string | null;
}

export interface ExecResult {
  success: boolean;
  motor: boolean;
  observation?: string;
  executorLines: string[];
}

function obsForSkill(
  config: TaskConfig,
  skillId: string,
  itemLabel: string,
  attributeChip: string,
  attempt: number,
): string {
  const skill = config.skills.find((s) => s.id === skillId);
  const ctx = {
    skillLabel: skill?.label ?? skillId,
    itemLabel,
    attributeChip,
    attempt,
  };
  const role = skill?.role;
  if (role === 'finish') return T.obsFoldFail(ctx);
  if (role === 'pick') return T.obsPickFail(ctx);
  if (role === 'place') return T.obsPlaceFail(ctx);
  if (role === 'prepare') return T.obsPrepareFail(ctx);
  return T.obsSkillFail(ctx);
}

export function executeAction(
  state: EpisodeState,
  config: TaskConfig,
  req: ExecRequest,
  rng: Rng,
): ExecResult {
  const nonMotorKinds: ActionKind[] = [
    'checkManifest',
    'reInspect',
    'escalate',
    'openContainer',
  ];

  if (nonMotorKinds.includes(req.kind) || !req.skillId) {
    const label =
      req.kind === 'checkManifest'
        ? `check ${config.manifest.label}`
        : req.kind === 'reInspect'
          ? 're-inspect'
          : req.kind === 'escalate'
            ? 'escalate-to-staff'
            : req.kind === 'openContainer'
              ? `open ${config.containers.label}`
              : req.kind;
    return {
      success: true,
      motor: false,
      executorLines: [T.nonMotorExec(label)],
    };
  }

  const skillId = req.skillId;
  const skill = config.skills.find((s) => s.id === skillId)!;
  const rt = skillRuntime(state, skillId);
  const itemId = req.itemId ?? null;
  const item = itemId ? getItem(state, itemId) : null;
  const attrId = itemId ? trueAttr(state, itemId) : 'normal';
  const attr = getAttr(config, attrId);
  const failKey = `${skillId}:${itemId ?? 'none'}`;
  const attempt = (state.failCounts[failKey] ?? 0) + 1;

  const success = !chance(rng, rt.failRate);
  const itemLabel = item?.label ?? 'item';
  const lines = [T.executorMotor(skill.label, itemLabel, success)];

  if (!success) {
    const observation = obsForSkill(config, skillId, itemLabel, attr.chip, attempt);
    lines.push(observation);
    return {
      success: false,
      motor: true,
      observation,
      executorLines: lines,
    };
  }

  return {
    success: true,
    motor: true,
    executorLines: lines,
  };
}
