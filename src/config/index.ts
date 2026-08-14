import type { TaskConfig } from '../types';
import { hospitalityConfig } from './hospitality';
import { foldingConfig } from './folding';
import { dynaDeliveryConfig } from './dynaDelivery';
import { genericFulfillmentConfig } from './genericFulfillment';
import { foodKittingConfig } from './foodKitting';

const configs: Record<string, TaskConfig> = {
  hospitality: hospitalityConfig,
  folding: foldingConfig,
  dynaDelivery: dynaDeliveryConfig,
  genericFulfillment: genericFulfillmentConfig,
  foodKitting: foodKittingConfig,
};

export function resolveDomain(search?: string): TaskConfig {
  const raw =
    search ??
    (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  const id = (params.get('domain') ?? 'hospitality').toLowerCase();
  const key = Object.keys(configs).find((k) => k.toLowerCase() === id);
  return (key ? configs[key] : undefined) ?? configs.hospitality;
}

export function listDomains(): string[] {
  return Object.keys(configs);
}

export {
  hospitalityConfig,
  foldingConfig,
  dynaDeliveryConfig,
  genericFulfillmentConfig,
  foodKittingConfig,
};
export { DEFAULT_SCORING, scoringOf } from './scoring';
