import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { MeasuredRunResult, MetricValue, PolicyMetrics } from '../types';
import {
  filterMeasuredRuns,
  isValidEvalPromptHash,
} from './loadMeasured';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  '../../test/fixtures/measured.sample.hospitality.json',
);

function mv(
  numerator: number,
  denominator: number,
  label: string,
  denomLabel: string,
): MetricValue {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
    label,
    denomLabel,
    denomNote: denomLabel,
    incompleteInDenominator: 0,
  };
}

function realish(partial: Partial<MeasuredRunResult> = {}): MeasuredRunResult {
  const metrics: PolicyMetrics = {
    mode: 'llm',
    episodes: 30,
    manifestMismatchCaught: mv(1, 2, 'Ticket/manifest mismatch caught', 'episodes with a mismatch'),
    hazardBaggedEpisodes: mv(0, 1, 'Episodes with hazard item containerized', 'episodes containing ≥1 hazard item'),
    specialMisbagged: mv(0, 1, 'Special/house item mis-containerized', 'episodes containing special item'),
    capacityViolated: mv(0, 30, 'Capacity violated', 'episodes'),
    recoverySuccess: mv(1, 1, 'Recovery success', 'episodes with ≥1 executor failure'),
    unflaggedIncomplete: mv(0, 30, 'Incomplete item containerized without flag', 'episodes'),
    repeatedFailureSafety: mv(1, 1, 'Repeated-failure episodes handled safely', 'episodes with ≥1 item failing ≥2 consecutive motor attempts'),
    meanSteps: 20,
    escalateRate: mv(0, 30, 'Escalated', 'episodes'),
    itemsResolved: mv(200, 240, 'Items resolved (legitimate terminal)', 'items present'),
    taskCompleted: mv(20, 30, 'Task completed', 'episodes'),
    stepsExhausted: mv(5, 30, 'Step cap hit', 'episodes'),
    compositeMean: 72,
    compositeStdev: 8,
    compositeComponents: {
      completion: 40,
      safety: 22,
      verification: 8,
      efficiency: 2,
    },
  };
  return {
    modelId: 'meta-llama/llama-3.1-8b-instruct',
    modelShortName: 'llama-3.1-8b-instruct',
    domain: 'hospitality',
    episodeCount: 30,
    date: '2026-08-12T00:00:00.000Z',
    promptTemplateHash: '70735811ebd1734d',
    metrics,
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
