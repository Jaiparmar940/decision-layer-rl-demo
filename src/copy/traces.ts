/**
 * All planner reasoning and executor OBS lines live here as templates.
 * // TODO(jaivir): rewrite — hand-edit every template.
 */

export interface GroundCtx {
  instruction: string;
  itemCount: number;
  manifestLabel: string;
  domainLabel: string;
  mode: string;
}

export interface DecomposeCtx {
  n: number;
  action: string;
  target?: string;
  detail?: string;
}

export interface VerifyCtx {
  step: number;
  action: string;
  itemLabel?: string;
  attributeChip?: string;
  success: boolean;
  note?: string;
}

export interface RecoveryCtx {
  itemLabel: string;
  skillLabel: string;
  attempt: number;
  decision: string;
  priorFailures: number;
}

export interface ManifestCtx {
  label: string;
  claimed: number;
  actual: number;
  mismatch: boolean;
  caught: boolean;
}

export interface InspectCtx {
  itemCount: number;
  revealedHazards: number;
  revealedSpecial: number;
  redundant?: boolean;
}

export interface EscalateCtx {
  reason: string;
  itemLabel?: string;
}

export interface ItemCtx {
  itemLabel: string;
  attributeChip: string;
  attributeId: string;
  index: number;
}

export interface ContainerCtx {
  containerLabel: string;
  containerIndex: number;
  fill: number;
  capacity: number;
}

export interface ObsCtx {
  skillLabel: string;
  itemLabel: string;
  attributeChip: string;
  attempt: number;
}

// TODO(jaivir): rewrite
export function groundInstruction(ctx: GroundCtx): string {
  return `GROUND: "${ctx.instruction}" · ${ctx.itemCount} items · mode=${ctx.mode.toUpperCase()}`;
}

// TODO(jaivir): rewrite
export function decomposeHeader(): string {
  return 'DECOMPOSE: building numbered plan…';
}

// TODO(jaivir): rewrite
export function decomposeStep(ctx: DecomposeCtx): string {
  const t = ctx.target ? ` → ${ctx.target}` : '';
  const d = ctx.detail ? ` (${ctx.detail})` : '';
  return `  ${ctx.n}. ${ctx.action}${t}${d}`;
}

// TODO(jaivir): rewrite
export function verifyLine(ctx: VerifyCtx): string {
  const item = ctx.itemLabel ? ` ${ctx.itemLabel}` : '';
  const attr = ctx.attributeChip ? ` [${ctx.attributeChip}]` : '';
  const status = ctx.success ? 'OK' : 'FAIL';
  const note = ctx.note ? ` · ${ctx.note}` : '';
  return `VERIFY s${ctx.step}: ${ctx.action}${item}${attr} → ${status}${note}`;
}

// TODO(jaivir): rewrite
export function recoveryDecision(ctx: RecoveryCtx): string {
  return `RECOVERY: ${ctx.skillLabel} failed on ${ctx.itemLabel} (x${ctx.priorFailures}) → ${ctx.decision}`;
}

// TODO(jaivir): rewrite
export function manifestCheck(ctx: ManifestCtx): string {
  if (!ctx.mismatch) {
    return `MANIFEST: ${ctx.label} count=${ctx.claimed} matches observed=${ctx.actual}`;
  }
  if (ctx.caught) {
    return `MANIFEST: mismatch claimed=${ctx.claimed} vs actual=${ctx.actual} — FLAGGED`;
  }
  return `MANIFEST: accepted claimed=${ctx.claimed} without reconciling actual=${ctx.actual}`;
}

// TODO(jaivir): rewrite
export function skipManifest(ctx: ManifestCtx): string {
  return `MANIFEST: skip verify (${ctx.label} claimed=${ctx.claimed}) — proceeding on visual count`;
}

// TODO(jaivir): rewrite
export function inspectLine(ctx: InspectCtx): string {
  const tag = ctx.redundant ? 're-inspect (redundant)' : 're-inspect';
  return `BELIEF: ${tag} · hazards=${ctx.revealedHazards} special=${ctx.revealedSpecial} / ${ctx.itemCount}`;
}

// TODO(jaivir): rewrite
export function escalateLine(ctx: EscalateCtx): string {
  const item = ctx.itemLabel ? ` · ${ctx.itemLabel}` : '';
  return `ESCALATE → staff${item}: ${ctx.reason}`;
}

// TODO(jaivir): rewrite
export function setAsideDecision(ctx: ItemCtx & { reason: string }): string {
  return `ROUTE: set-aside ${ctx.itemLabel} [${ctx.attributeChip}] — ${ctx.reason}`;
}

// TODO(jaivir): rewrite
export function bagHazardDecision(ctx: ItemCtx & { mistaken: boolean }): string {
  if (ctx.mistaken) {
    return `ROUTE: bag ${ctx.itemLabel} [${ctx.attributeChip}] — hazard not gated`;
  }
  return `ROUTE: hold ${ctx.itemLabel} [${ctx.attributeChip}] for set-aside`;
}

// TODO(jaivir): rewrite
export function missSpecialDecision(ctx: ItemCtx): string {
  return `ROUTE: treat ${ctx.itemLabel} [${ctx.attributeChip}] as guest item (special missed)`;
}

// TODO(jaivir): rewrite
export function openContainerLine(ctx: ContainerCtx): string {
  return `CAPACITY: open ${ctx.containerLabel} #${ctx.containerIndex} (cap ${ctx.capacity})`;
}

// TODO(jaivir): rewrite
export function capacitySplitLine(ctx: ContainerCtx): string {
  return `CAPACITY: ${ctx.containerLabel} full ${ctx.fill}/${ctx.capacity} — split load`;
}

// TODO(jaivir): rewrite
export function processItemLine(ctx: ItemCtx): string {
  return `FOCUS: ${ctx.itemLabel} [${ctx.attributeChip}]`;
}

// TODO(jaivir): rewrite
export function episodeComplete(steps: number, mode: string): string {
  return `DONE: episode complete · steps=${steps} · policy=${mode.toUpperCase()}`;
}

// TODO(jaivir): rewrite
export function executorMotor(
  skillLabel: string,
  itemLabel: string,
  success: boolean,
): string {
  return `EXEC: ${skillLabel} ${itemLabel} → ${success ? 'success' : 'fail'}`;
}

// TODO(jaivir): rewrite
export function obsSkillFail(ctx: ObsCtx): string {
  return `OBS: ${ctx.skillLabel} incomplete on ${ctx.itemLabel} [${ctx.attributeChip}] · attempt ${ctx.attempt} — garment state degraded`;
}

// TODO(jaivir): rewrite
export function obsFoldFail(ctx: ObsCtx): string {
  return `OBS: garment crumpled, fold incomplete on ${ctx.itemLabel} · attempt ${ctx.attempt}`;
}

// TODO(jaivir): rewrite
export function obsPickFail(ctx: ObsCtx): string {
  return `OBS: grasp slip on ${ctx.itemLabel} · attempt ${ctx.attempt}`;
}

/** Live HUD: pick motor fail + grasp-slip observation. */
export function isPickFailTrace(text: string, pickLabel = 'pick'): boolean {
  if (text.startsWith('OBS: grasp slip')) return true;
  return text.startsWith(`EXEC: ${pickLabel} `) && text.endsWith('→ fail');
}

// TODO(jaivir): rewrite
export function obsPlaceFail(ctx: ObsCtx): string {
  return `OBS: placement unstable for ${ctx.itemLabel} · attempt ${ctx.attempt}`;
}

// TODO(jaivir): rewrite
export function obsPrepareFail(ctx: ObsCtx): string {
  return `OBS: prep incomplete on ${ctx.itemLabel} · attempt ${ctx.attempt}`;
}

// TODO(jaivir): rewrite
export function nonMotorExec(action: string): string {
  return `EXEC: ${action} → ok (non-motor)`;
}

// TODO(jaivir): rewrite
export function placeIncompleteNote(itemLabel: string): string {
  return `ROUTE: bag-unfolded / place-incomplete ${itemLabel} + flag`;
}

export interface ArrivalCtx {
  count: number;
  appearances: string[];
}

// TODO(jaivir): rewrite
export function obsArrival(ctx: ArrivalCtx): string {
  const appears = ctx.appearances.map((a) => `appears ${a}`).join(', ');
  return `OBS: ${ctx.count} item${ctx.count === 1 ? '' : 's'} arrived — ${appears}`;
}

export interface TypeConfirmCtx {
  itemLabel: string;
  typeLabel: string;
}

// TODO(jaivir): rewrite
export function obsTypeConfirmed(ctx: TypeConfirmCtx): string {
  return `OBS: handle ${ctx.itemLabel} — type confirms as ${ctx.typeLabel}`;
}

export interface QualityGateCtx {
  itemLabel: string;
  itemProfile: string;
  committedProfile: string;
  containerLabel: string;
}

// TODO(jaivir): rewrite
export function obsQualityGateReject(ctx: QualityGateCtx): string {
  return `OBS: uniform-stack reject ${ctx.itemLabel} profile=${ctx.itemProfile} ≠ ${ctx.containerLabel} committed=${ctx.committedProfile}`;
}

export interface RouteOrderCtx {
  itemLabel: string;
  typeLabel: string;
  orderLabel: string;
  containerId: string;
}

// TODO(jaivir): rewrite
export function routeToOrder(ctx: RouteOrderCtx): string {
  return `ROUTE: ${ctx.itemLabel} [${ctx.typeLabel}] → ${ctx.orderLabel} (${ctx.containerId})`;
}

export interface ShortShipCtx {
  lines: Array<{ orderLabel: string; typeId: string; missing: number }>;
  flagged: boolean;
  held?: boolean;
}

// TODO(jaivir): rewrite
export function shortShipLine(ctx: ShortShipCtx): string {
  const detail = ctx.lines
    .map((l) => `${l.orderLabel} ${l.typeId} short ${l.missing}`)
    .join('; ');
  if (ctx.held) return `HOLD: stream ended with unmet lines — ${detail}`;
  if (ctx.flagged) return `FLAG-SHORT: ${detail}`;
  return `SHORT: finish with unflagged unmet lines — ${detail}`;
}
