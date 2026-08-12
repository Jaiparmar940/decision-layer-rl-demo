import { useEffect, useRef, useState } from 'react';
import type { TaskConfig } from '../types';
import {
  runResultsBatch,
  type DetailedBatchResult,
} from '../engine/batch';

const cache = new Map<string, DetailedBatchResult>();

export type ResultsLoadState =
  | { status: 'idle' }
  | { status: 'computing' }
  | { status: 'ready'; data: DetailedBatchResult }
  | { status: 'error'; message: string };

/**
 * On first activation for a domain, run 1,000-episode batch (fixed seeds)
 * after a paint so the "computing…" state is visible, then cache in memory.
 */
export function useResultsBatch(
  active: boolean,
  config: TaskConfig,
): ResultsLoadState {
  const [state, setState] = useState<ResultsLoadState>(() => {
    const hit = cache.get(config.meta.id);
    return hit ? { status: 'ready', data: hit } : { status: 'idle' };
  });
  const domainRef = useRef(config.meta.id);

  useEffect(() => {
    domainRef.current = config.meta.id;
    const hit = cache.get(config.meta.id);
    if (hit) {
      setState({ status: 'ready', data: hit });
      return;
    }
    if (!active) {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'computing' });
    let cancelled = false;

    // Yield so "computing…" paints before the synchronous batch
    const handle = window.setTimeout(() => {
      try {
        const data = runResultsBatch(config);
        if (cancelled) return;
        cache.set(config.meta.id, data);
        setState({ status: 'ready', data });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: e instanceof Error ? e.message : 'batch failed',
        });
      }
    }, 30);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [active, config]);

  return state;
}

/** Test helper: clear in-memory RESULTS cache */
export function clearResultsCache(): void {
  cache.clear();
}
