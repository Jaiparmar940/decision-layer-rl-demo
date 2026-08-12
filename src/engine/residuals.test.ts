import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../config/hospitality';
import { measureTrainedResiduals } from './batch';

describe('trained residual rates', () => {
  it('empirical policy rolls within ±3pts of config over 1000 episodes', () => {
    const n = 1000;
    const rates = measureTrainedResiduals(hospitalityConfig, n);
    const t = hospitalityConfig.plannerRates.trained;
    const tol = 0.03;

    const check = (name: string, got: number | null, expected: number) => {
      expect(got, name).not.toBeNull();
      expect(Math.abs((got as number) - expected), name).toBeLessThanOrEqual(tol);
    };

    check('catchManifestMismatch', rates.catchManifestMismatch, t.catchManifestMismatch);
    check('setAsideHazard', rates.setAsideHazard, t.setAsideHazard);
    check('detectSpecial', rates.detectSpecial, t.detectSpecialItem);
    check('recoverySuccess', rates.recoverySuccess, t.recoverySuccess);
    check(
      'redundantReinspectEpisode',
      rates.redundantReinspectEpisode,
      t.redundantReinspectEpisode,
    );

    // ensure denominators are meaningful
    expect(rates.denominators.catchD).toBeGreaterThan(50);
    expect(rates.denominators.asideD).toBeGreaterThan(50);
    expect(rates.denominators.detectD).toBeGreaterThan(50);
    expect(rates.denominators.recoveryD).toBeGreaterThan(10);
  });
});
