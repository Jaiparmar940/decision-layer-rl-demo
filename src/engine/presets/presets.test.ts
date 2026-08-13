import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../../config/hospitality';
import { foldingConfig } from '../../config/folding';
import { PRESET_FIXTURES, runActionScript, presetMeetsKind } from './index';
import type { TaskConfig } from '../../types';

const CONFIG: Record<string, TaskConfig> = {
  hospitality: hospitalityConfig,
  folding: foldingConfig,
};

describe('preset grader classification (6 fixtures)', () => {
  it('has six checked-in scripts', () => {
    expect(PRESET_FIXTURES).toHaveLength(6);
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
