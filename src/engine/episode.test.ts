import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../config/hospitality';
import { foldingConfig } from '../config/folding';
import { episodeSeedOnly, runEpisode } from './runner';

describe('split RNG — same-seed episode equality across modes', () => {
  const seeds = [1, 2, 42, 8813];

  for (const seed of seeds) {
    it(`hospitality seed ${seed}: baseline and trained share episode ground truth`, () => {
      const a = episodeSeedOnly(hospitalityConfig, seed, 7);
      const b = episodeSeedOnly(hospitalityConfig, seed, 7);
      expect(a).toEqual(b);

      const base = runEpisode({
        config: hospitalityConfig,
        masterSeed: seed,
        mode: 'baseline',
        episodeSerial: 7,
      });
      const train = runEpisode({
        config: hospitalityConfig,
        masterSeed: seed,
        mode: 'trained',
        episodeSerial: 7,
      });

      expect(base.state.seedData.items).toEqual(train.state.seedData.items);
      expect(base.state.seedData.manifestClaimed).toBe(
        train.state.seedData.manifestClaimed,
      );
      expect(base.state.seedData.containerCapacity).toBe(
        train.state.seedData.containerCapacity,
      );
      expect(base.state.seedData.skills).toEqual(train.state.seedData.skills);
    });
  }

  it('re-running same seed+mode reproduces score', () => {
    const r1 = runEpisode({
      config: hospitalityConfig,
      masterSeed: 8813,
      mode: 'trained',
      episodeSerial: 3,
    });
    const r2 = runEpisode({
      config: hospitalityConfig,
      masterSeed: 8813,
      mode: 'trained',
      episodeSerial: 3,
    });
    expect(r1.score).toEqual(r2.score);
    expect(r1.plannerLines.map((l) => l.text)).toEqual(
      r2.plannerLines.map((l) => l.text),
    );
  });

  it('folding domain also has cross-mode episode equality', () => {
    const seed = 4242;
    const base = runEpisode({
      config: foldingConfig,
      masterSeed: seed,
      mode: 'baseline',
      episodeSerial: 1,
    });
    const train = runEpisode({
      config: foldingConfig,
      masterSeed: seed,
      mode: 'trained',
      episodeSerial: 1,
    });
    expect(base.state.seedData.items).toEqual(train.state.seedData.items);
  });
});
