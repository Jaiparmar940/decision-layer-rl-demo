import type { MeasuredRunResult } from '../types';

/**
 * Load committed measured LLM results for a domain (static JSON under
 * public/results/). Missing file → null (dashboard unchanged).
 */
export async function loadMeasuredResults(
  domainId: string,
): Promise<MeasuredRunResult[] | null> {
  try {
    const url = `${import.meta.env.BASE_URL}results/measured.${domainId}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;
    return data as MeasuredRunResult[];
  } catch {
    return null;
  }
}
