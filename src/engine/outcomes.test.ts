import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import type { TaskConfig } from '../types';
import { runBatch } from './batch';

function assertOutcomeRates(name: string, config: TaskConfig) {
  const batch = runBatch(config, 1000);
  const t = batch.trained;
  const b = batch.baseline;

  // trained recovery success in [85%, 95%]
  expect(t.recoverySuccess.rate, `${name} trained recovery`).not.toBeNull();
  expect(t.recoverySuccess.rate!).toBeGreaterThanOrEqual(0.85);
  expect(t.recoverySuccess.rate!).toBeLessThanOrEqual(0.95);

  // trained special misbagged in [2%, 9%] both domains
  expect(t.specialMisbagged.rate, `${name} trained special mis`).not.toBeNull();
  expect(t.specialMisbagged.rate!).toBeGreaterThanOrEqual(0.02);
  expect(t.specialMisbagged.rate!).toBeLessThanOrEqual(0.09);

  // baseline unflagged-incomplete strictly greater than trained; trained must be 0
  expect(t.unflaggedIncomplete.rate).toBe(0);
  expect(b.unflaggedIncomplete.rate).not.toBeNull();
  expect(b.unflaggedIncomplete.rate!).toBeGreaterThan(t.unflaggedIncomplete.rate!);

  // every conditional metric's denominator < episode count
  const conditional = [
    t.manifestMismatchCaught,
    t.hazardBaggedEpisodes,
    t.specialMisbagged,
    t.recoverySuccess,
    t.repeatedFailureSafety,
    b.manifestMismatchCaught,
    b.hazardBaggedEpisodes,
    b.specialMisbagged,
    b.recoverySuccess,
    b.repeatedFailureSafety,
  ];
  for (const m of conditional) {
    if (m.denominator > 0) {
      expect(m.denominator, m.label).toBeLessThan(1000);
    }
  }

  // separation targets (soft check that metrics move the right way)
  expect(t.recoverySuccess.rate!).toBeGreaterThan(
    (b.recoverySuccess.rate ?? 0) + 0.15,
  );
  expect(t.repeatedFailureSafety.rate ?? 0).toBeGreaterThan(
    (b.repeatedFailureSafety.rate ?? 0) + 0.25,
  );
}

describe('outcome-level dashboard rates (1000 eps)', () => {
  it('hospitality', () => {
    assertOutcomeRates('hospitality', hospitalityConfig);
  }, 60_000);

  it('folding', () => {
    assertOutcomeRates('folding', foldingConfig);
  }, 60_000);
});
