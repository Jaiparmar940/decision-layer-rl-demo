import { describe, expect, it } from 'vitest';
import { resolveDomainId, resolveEmbedded, resolveView } from './routing';
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

  it('sort-to-order domains resolve', () => {
    expect(resolveDomainId('?domain=dynaDelivery')).toBe('dynaDelivery');
    expect(resolveDomain('?domain=dynaDelivery').meta.id).toBe('dynaDelivery');
    expect(resolveDomain('?domain=genericFulfillment').meta.id).toBe(
      'genericFulfillment',
    );
    expect(resolveDomainId('?domain=foodKitting')).toBe('foodKitting');
    expect(resolveDomain('?domain=foodKitting').meta.id).toBe('foodKitting');
  });

  it('resolves sidebar views', () => {
    expect(resolveView('?view=episodes')).toBe('episodes');
    expect(resolveView('?view=evals')).toBe('evals');
    expect(resolveView('?view=curves')).toBe('curves');
    expect(resolveView('?view=models')).toBe('models');
    expect(resolveView('?view=manual')).toBe('manual');
  });

  it('distinguishes the homepage embed from the standalone demo', () => {
    expect(resolveEmbedded('?embed=1')).toBe(true);
    expect(resolveEmbedded('?domain=folding&embed=1')).toBe(true);
    expect(resolveEmbedded('?embed=0')).toBe(false);
    expect(resolveEmbedded('')).toBe(false);
  });
});
