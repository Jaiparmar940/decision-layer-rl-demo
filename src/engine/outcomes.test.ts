import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import { dynaDeliveryConfig } from '../config/dynaDelivery';
import { genericFulfillmentConfig } from '../config/genericFulfillment';
import { foodKittingConfig } from '../config/foodKitting';
import type { BatchResult } from '../types';
import { runBatch } from './batch';

function assertOutcomeRates(name: string, batch: BatchResult) {
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

function assertSortToOrderCalibration(name: string, batch: BatchResult) {
  const t = batch.trained;
  const b = batch.baseline;
  const n = batch.episodeCount;

  const shortDenom = t.unflaggedShortShip.denominator;
  expect(shortDenom / n, `${name} genuine-short rate`).toBeGreaterThanOrEqual(0.2);
  expect(shortDenom / n, `${name} genuine-short rate`).toBeLessThanOrEqual(0.3);
  expect(b.unflaggedShortShip.denominator, `${name} baseline short denom`).toBe(shortDenom);

  expect(t.unflaggedShortShip.numerator, `${name} trained unflagged short`).toBe(0);

  expect(t.ordersCompletedCorrectly.rate, `${name} trained orders`).not.toBeNull();
  expect(t.ordersCompletedCorrectly.rate!).toBeGreaterThanOrEqual(0.7);
  expect(b.ordersCompletedCorrectly.rate, `${name} baseline orders`).not.toBeNull();
  expect(b.ordersCompletedCorrectly.rate!).toBeLessThanOrEqual(0.25);

  expect(t.compositeMean, `${name} trained composite`).toBeGreaterThanOrEqual(85);
  expect(b.compositeMean, `${name} baseline composite`).toBeLessThanOrEqual(40);

  expect(b.misroutedItems.rate, `${name} baseline misrouted`).not.toBeNull();
  expect(t.misroutedItems.rate, `${name} trained misrouted`).not.toBeNull();
  expect(b.misroutedItems.rate! - t.misroutedItems.rate!).toBeGreaterThanOrEqual(0.2);

  expect(b.foreignObjectContainerized.rate, `${name} baseline foreign`).not.toBeNull();
  expect(t.foreignObjectContainerized.rate, `${name} trained foreign`).not.toBeNull();
  expect(
    b.foreignObjectContainerized.rate! - t.foreignObjectContainerized.rate!,
  ).toBeGreaterThanOrEqual(0.2);

  expect(b.unflaggedShortShip.rate, `${name} baseline short`).not.toBeNull();
  expect(t.unflaggedShortShip.rate, `${name} trained short`).not.toBeNull();
  expect(b.unflaggedShortShip.rate! - t.unflaggedShortShip.rate!).toBeGreaterThanOrEqual(
    0.2,
  );
}

describe('outcome-level dashboard rates (1000 eps)', () => {
  it('hospitality', () => {
    assertOutcomeRates('hospitality', runBatch(hospitalityConfig, 1000));
  }, 60_000);

  it('folding', () => {
    assertOutcomeRates('folding', runBatch(foldingConfig, 1000));
  }, 60_000);

  it('dynaDelivery', () => {
    const batch = runBatch(dynaDeliveryConfig, 1000);
    assertSortToOrderCalibration('dynaDelivery', batch);
  }, 90_000);

  it('genericFulfillment', () => {
    const batch = runBatch(genericFulfillmentConfig, 1000);
    assertSortToOrderCalibration('genericFulfillment', batch);
  }, 90_000);

  it('foodKitting', () => {
    const batch = runBatch(foodKittingConfig, 1000);
    assertSortToOrderCalibration('foodKitting', batch);
  }, 90_000);
});
