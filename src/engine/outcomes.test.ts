import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import type { TaskConfig } from '../types';
import { runBatch } from './batch';

function assertOutcomeRates(name: string, config: TaskConfig) {
  const batch = runBatch(config, 1000);
  const t = batch.trained;
  const b = batch.baseline;

  // baseline recovery success in [50%, 80%]
  expect(b.recoverySuccess.rate, `${name} baseline recovery`).not.toBeNull();
  expect(b.recoverySuccess.rate!).toBeGreaterThanOrEqual(0.5);
  expect(b.recoverySuccess.rate!).toBeLessThanOrEqual(0.8);

  // trained recovery success in [85%, 95%]
  expect(t.recoverySuccess.rate, `${name} trained recovery`).not.toBeNull();
  expect(t.recoverySuccess.rate!).toBeGreaterThanOrEqual(0.85);
  expect(t.recoverySuccess.rate!).toBeLessThanOrEqual(0.95);

  // baseline repeatedFailureSafety in [8%, 25%]
  expect(b.repeatedFailureSafety.rate, `${name} baseline safety`).not.toBeNull();
  expect(b.repeatedFailureSafety.rate!).toBeGreaterThanOrEqual(0.08);
  expect(b.repeatedFailureSafety.rate!).toBeLessThanOrEqual(0.25);

  // trained repeatedFailureSafety ≥ 98%
  expect(t.repeatedFailureSafety.rate, `${name} trained safety`).not.toBeNull();
  expect(t.repeatedFailureSafety.rate!).toBeGreaterThanOrEqual(0.98);

  // baseline unflaggedIncomplete > 15%; trained = 0
  expect(t.unflaggedIncomplete.rate).toBe(0);
  expect(b.unflaggedIncomplete.rate).not.toBeNull();
  expect(b.unflaggedIncomplete.rate!).toBeGreaterThan(0.15);

  // separation ≥ 20pts on recovery and unflaggedIncomplete
  expect(t.recoverySuccess.rate! - b.recoverySuccess.rate!).toBeGreaterThanOrEqual(
    0.2,
  );
  expect(b.unflaggedIncomplete.rate! - t.unflaggedIncomplete.rate!).toBeGreaterThanOrEqual(
    0.2,
  );

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
}

describe('outcome-level dashboard rates (1000 eps)', () => {
  it('hospitality', () => {
    assertOutcomeRates('hospitality', hospitalityConfig);
  }, 60_000);

  it('folding', () => {
    assertOutcomeRates('folding', foldingConfig);
  }, 60_000);
});
