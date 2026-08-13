import { describe, expect, it } from 'vitest';
import { resolveDomainId, resolveView } from './routing';
import { resolveDomain } from './config';

describe('deep-link view + domain', () => {
  it('?view=results&domain=folding activates results tab and folding domain', () => {
    const search = '?view=results&domain=folding';
    expect(resolveView(search)).toBe('results');
    expect(resolveDomainId(search)).toBe('folding');
    expect(resolveDomain(search).meta.id).toBe('folding');
  });

  it('unknown view falls back to live', () => {
    expect(resolveView('?view=dashboard')).toBe('live');
    expect(resolveView('?view=')).toBe('live');
    expect(resolveView('')).toBe('live');
  });

  it('view=results alone keeps default domain hospitality', () => {
    expect(resolveView('?view=results')).toBe('results');
    expect(resolveDomainId('?view=results')).toBe('hospitality');
    expect(resolveDomain('?view=results').meta.id).toBe('hospitality');
  });

  it('domain param works without view', () => {
    expect(resolveView('?domain=folding')).toBe('live');
    expect(resolveDomain('?domain=folding').meta.id).toBe('folding');
  });

  it('resolves sidebar views', () => {
    expect(resolveView('?view=episodes')).toBe('episodes');
    expect(resolveView('?view=evals')).toBe('evals');
    expect(resolveView('?view=curves')).toBe('curves');
    expect(resolveView('?view=models')).toBe('models');
  });
});
