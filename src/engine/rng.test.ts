import { describe, expect, it } from 'vitest';
import { deriveStreams, mulberry32 } from './rng';

describe('mulberry32', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });
});

describe('deriveStreams', () => {
  it('keeps episode / baseline / trained streams independent', () => {
    const s = deriveStreams(8813);
    const e1 = s.streamEpisode();
    const b1 = s.streamExecutorBaseline();
    // advancing episode does not change baseline sequence from a fresh derive
    const s2 = deriveStreams(8813);
    expect(s2.streamEpisode()).toBe(e1);
    expect(s2.streamExecutorBaseline()).toBe(b1);

    // baseline and trained differ
    const s3 = deriveStreams(8813);
    const baseSeq = Array.from({ length: 5 }, () => s3.streamExecutorBaseline());
    const s4 = deriveStreams(8813);
    const trainSeq = Array.from({ length: 5 }, () => s4.streamExecutorTrained());
    expect(baseSeq).not.toEqual(trainSeq);
  });
});
