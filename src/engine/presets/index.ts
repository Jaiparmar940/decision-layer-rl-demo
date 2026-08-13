import type { PresetFixture, PresetKind } from './runScript';
import hospitalityPerfect from './fixtures/hospitality-perfect.json';
import hospitalityNegligent from './fixtures/hospitality-negligent.json';
import hospitalityRecovery from './fixtures/hospitality-recovery.json';
import foldingPerfect from './fixtures/folding-perfect.json';
import foldingNegligent from './fixtures/folding-negligent.json';
import foldingRecovery from './fixtures/folding-recovery.json';
import dynaDeliveryPerfect from './fixtures/dynaDelivery-perfect.json';
import dynaDeliveryNegligent from './fixtures/dynaDelivery-negligent.json';
import dynaDeliveryRecovery from './fixtures/dynaDelivery-recovery.json';
import genericFulfillmentPerfect from './fixtures/genericFulfillment-perfect.json';
import genericFulfillmentNegligent from './fixtures/genericFulfillment-negligent.json';
import genericFulfillmentRecovery from './fixtures/genericFulfillment-recovery.json';

export const PRESET_FIXTURES: PresetFixture[] = [
  hospitalityPerfect as PresetFixture,
  hospitalityNegligent as PresetFixture,
  hospitalityRecovery as PresetFixture,
  foldingPerfect as PresetFixture,
  foldingNegligent as PresetFixture,
  foldingRecovery as PresetFixture,
  dynaDeliveryPerfect as PresetFixture,
  dynaDeliveryNegligent as PresetFixture,
  dynaDeliveryRecovery as PresetFixture,
  genericFulfillmentPerfect as PresetFixture,
  genericFulfillmentNegligent as PresetFixture,
  genericFulfillmentRecovery as PresetFixture,
];

export function presetsForDomain(domain: string): PresetFixture[] {
  return PRESET_FIXTURES.filter((p) => p.domain === domain);
}

export function findPreset(domain: string, kind: PresetKind): PresetFixture {
  const p = PRESET_FIXTURES.find((x) => x.domain === domain && x.kind === kind);
  if (!p) throw new Error(`missing preset ${domain}-${kind}`);
  return p;
}

export type { PresetFixture, PresetKind } from './runScript';
export { runActionScript, presetMeetsKind } from './runScript';
