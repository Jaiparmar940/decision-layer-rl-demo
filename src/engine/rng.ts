export type Rng = () => number;

/** mulberry32 */
export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(master: number, salt: string): number {
  let h = master >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x9e3779b1);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export interface StreamBundle {
  masterSeed: number;
  streamEpisode: Rng;
  streamExecutorBaseline: Rng;
  streamExecutorTrained: Rng;
}

export function deriveStreams(masterSeed: number): StreamBundle {
  const s = masterSeed >>> 0;
  return {
    masterSeed: s,
    streamEpisode: mulberry32(hashSeed(s, 'episode')),
    streamExecutorBaseline: mulberry32(hashSeed(s, 'exec-baseline')),
    streamExecutorTrained: mulberry32(hashSeed(s, 'exec-trained')),
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function pickWeighted(
  rng: Rng,
  weights: { id: string; w: number }[],
): string {
  const total = weights.reduce((a, b) => a + b.w, 0);
  let r = rng() * total;
  for (const entry of weights) {
    r -= entry.w;
    if (r <= 0) return entry.id;
  }
  return weights[weights.length - 1]!.id;
}

export function formatEpisodeId(n: number): string {
  return `EP-${String(n).padStart(4, '0')}`;
}

export function randomMasterSeed(rng: Rng = Math.random): number {
  return Math.floor(rng() * 9000) + 1000;
}
