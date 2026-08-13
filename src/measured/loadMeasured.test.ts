import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { MeasuredRunResult } from '../types';
import {
  filterMeasuredRuns,
  isValidEvalPromptHash,
} from './loadMeasured';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  '../../test/fixtures/measured.sample.hospitality.json',
);

function realish(partial: Partial<MeasuredRunResult> = {}): MeasuredRunResult {
  return {
    modelId: 'meta-llama/llama-3.1-8b-instruct',
    modelShortName: 'llama-3.1-8b-instruct',
    domain: 'hospitality',
    episodeCount: 30,
    date: '2026-08-12T00:00:00.000Z',
    promptTemplateHash: '70735811ebd1734d',
    metrics: {
      mode: 'llm',
      episodes: 30,
      manifestMismatchCaught: {
        numerator: 1,
        denominator: 2,
        rate: 0.5,
        label: 'Ticket/manifest mismatch caught',
        denomLabel: 'episodes with a mismatch',
      },
      hazardBaggedEpisodes: {
        numerator: 0,
        denominator: 1,
        rate: 0,
        label: 'Episodes with hazard item containerized',
        denomLabel: 'episodes containing ≥1 hazard item',
      },
      specialMisbagged: {
        numerator: 0,
        denominator: 1,
        rate: 0,
        label: 'Special/house item mis-containerized',
        denomLabel: 'episodes containing special item',
      },
      capacityViolated: {
        numerator: 0,
        denominator: 30,
        rate: 0,
        label: 'Capacity violated',
        denomLabel: 'episodes',
      },
      recoverySuccess: {
        numerator: 1,
        denominator: 1,
        rate: 1,
        label: 'Recovery success',
        denomLabel: 'episodes with ≥1 executor failure',
      },
      unflaggedIncomplete: {
        numerator: 0,
        denominator: 30,
        rate: 0,
        label: 'Incomplete item containerized without flag',
        denomLabel: 'episodes',
      },
      repeatedFailureSafety: {
        numerator: 1,
        denominator: 1,
        rate: 1,
        label: 'Repeated-failure episodes handled safely',
        denomLabel: 'episodes with ≥1 item failing ≥2 consecutive motor attempts',
      },
      meanSteps: 20,
      escalateRate: {
        numerator: 0,
        denominator: 30,
        rate: 0,
        label: 'Escalated',
        denomLabel: 'episodes',
      },
    },
    invalidActionCount: 0,
    meanSteps: 20,
    meanTokensPerEpisode: 1000,
    totalCostEstimate: 0.01,
    wallMs: 1000,
    ...partial,
  };
}

describe('filterMeasuredRuns', () => {
  it('filters out sample/-prefixed entries from fixture payload', () => {
    const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[];
    const warn = vi.fn();
    const kept = filterMeasuredRuns(raw, warn);
    expect(kept).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('sample/')),
    ).toBe(true);
  });

  it('rejects sample/ even when hash looks valid', () => {
    const warn = vi.fn();
    const kept = filterMeasuredRuns(
      [
        realish({
          modelId: 'sample/open-small-demo',
          promptTemplateHash: 'abcdef0123456789',
        }),
      ],
      warn,
    );
    expect(kept).toEqual([]);
    expect(warn.mock.calls[0]![0]).toMatch(/sample\//);
  });

  it('rejects invalid promptTemplateHash', () => {
    const warn = vi.fn();
    const kept = filterMeasuredRuns(
      [realish({ promptTemplateHash: 'sample0000000000' })],
      warn,
    );
    expect(kept).toEqual([]);
    expect(warn.mock.calls[0]![0]).toMatch(/promptTemplateHash/);
  });

  it('keeps real eval-shaped entries', () => {
    const warn = vi.fn();
    const row = realish();
    const kept = filterMeasuredRuns([row], warn);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.modelId).toBe(row.modelId);
    expect(warn).not.toHaveBeenCalled();
  });

  it('isValidEvalPromptHash matches eval-llm 16-hex form', () => {
    expect(isValidEvalPromptHash('70735811ebd1734d')).toBe(true);
    expect(isValidEvalPromptHash('SAMPLE0000000000')).toBe(false);
    expect(isValidEvalPromptHash('sample0000000000')).toBe(false);
    expect(isValidEvalPromptHash('abc')).toBe(false);
    expect(isValidEvalPromptHash(null)).toBe(false);
  });
});
