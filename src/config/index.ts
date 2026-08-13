import type { TaskConfig } from '../types';
import { hospitalityConfig } from './hospitality';
import { foldingConfig } from './folding';

const configs: Record<string, TaskConfig> = {
  hospitality: hospitalityConfig,
  folding: foldingConfig,
};

export function resolveDomain(search?: string): TaskConfig {
  const raw =
    search ??
    (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  const id = (params.get('domain') ?? 'hospitality').toLowerCase();
  return configs[id] ?? configs.hospitality;
}

export function listDomains(): string[] {
  return Object.keys(configs);
}

export { hospitalityConfig, foldingConfig };
export { DEFAULT_SCORING, scoringOf } from './scoring';
