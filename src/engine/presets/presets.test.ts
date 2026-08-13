import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../../config/hospitality';
import { foldingConfig } from '../../config/folding';
import { dynaDeliveryConfig } from '../../config/dynaDelivery';
import { genericFulfillmentConfig } from '../../config/genericFulfillment';
import { PRESET_FIXTURES, runActionScript, presetMeetsKind } from './index';
import type { TaskConfig } from '../../types';

const CONFIG: Record<string, TaskConfig> = {
  hospitality: hospitalityConfig,
  folding: foldingConfig,
  dynaDelivery: dynaDeliveryConfig,
  genericFulfillment: genericFulfillmentConfig,
};

describe('preset grader classification (12 fixtures)', () => {
  it('has twelve checked-in scripts', () => {
    expect(PRESET_FIXTURES).toHaveLength(12);
  });

  for (const fixture of PRESET_FIXTURES) {
    it(`${fixture.id} classifies as ${fixture.kind}`, () => {
      const config = CONFIG[fixture.domain];
      expect(config).toBeTruthy();
      const transcript = runActionScript(
        config!,
        fixture.masterSeed,
        fixture.actions,
        fixture.maxSteps,
      );
      const err = presetMeetsKind(fixture.kind, transcript);
      expect(err, JSON.stringify(transcript.scorecard)).toBeNull();
    });
  }
});
