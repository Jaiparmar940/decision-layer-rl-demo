export type AppView = 'live' | 'results';

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
  if (v === 'results') return 'results';
  return 'live';
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
  if (id === 'folding') return 'folding';
  return 'hospitality';
}
