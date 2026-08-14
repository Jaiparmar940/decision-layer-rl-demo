import { listDomains } from './config';

export type AppView =
  | 'live'
  | 'results'
  | 'episodes'
  | 'evals'
  | 'curves'
  | 'models'
  | 'manual';

const VIEWS: readonly AppView[] = [
  'live',
  'results',
  'episodes',
  'evals',
  'curves',
  'models',
  'manual',
] as const;

/**
 * Resolve view tab from query string. Unknown values → live.
 * Composable with ?domain=.
 */
export function resolveView(search?: string): AppView {
  const raw =
    search ??
    (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  const v = (params.get('view') ?? 'live').toLowerCase();
  if ((VIEWS as readonly string[]).includes(v)) return v as AppView;
  return 'live';
}

/** True only for the compact surface hosted inside the snlabs.dev homepage. */
export function resolveEmbedded(search?: string): boolean {
  const raw =
    search ??
    (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  return params.get('embed') === '1';
}

/** Update view query param without dropping domain (and other) params. */
export function setViewInUrl(view: AppView): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (view === 'live') {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', view);
  }
  window.history.replaceState({}, '', url.toString());
}

/** Domain id from query (mirrors resolveDomain without loading config). */
export function resolveDomainId(search?: string): string {
  const raw =
    search ??
    (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  const id = (params.get('domain') ?? 'hospitality').toLowerCase();
  const key = listDomains().find((k) => k.toLowerCase() === id);
  return key ?? 'hospitality';
}

/** Update domain query param without dropping view (and other) params. */
export function setDomainInUrl(domainId: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (domainId === 'hospitality') {
    url.searchParams.delete('domain');
  } else {
    url.searchParams.set('domain', domainId);
  }
  window.history.replaceState({}, '', url.toString());
}
