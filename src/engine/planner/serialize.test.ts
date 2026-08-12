import { describe, expect, it } from 'vitest';
import { hospitalityConfig } from '../../config/hospitality';
import { createInitialState, generateEpisodeSeed } from '../episode';
import {
  formatPlannerUserMessage,
  serializePlannerView,
  serializedLeaksGroundTruth,
} from './serialize';

describe('planner serializer belief isolation', () => {
  it('does not expose ground-truth-only attributes before inspection', () => {
    const { seedData } = generateEpisodeSeed(hospitalityConfig, 4242, 1);
    // Force at least one non-normal ground-truth attribute
    const hazardish = hospitalityConfig.itemAttributes.find((a) => a.hazard)!;
    seedData.items[0] = {
      ...seedData.items[0]!,
      attributeId: hazardish.id,
    };
    seedData.hasHazardItem = true;

    const state = createInitialState(seedData, 'llm', hospitalityConfig);
    // Beliefs start uninspected
    expect(state.beliefs.every((b) => !b.inspected)).toBe(true);

    const view = serializePlannerView(state, hospitalityConfig);
    const text = formatPlannerUserMessage(state, hospitalityConfig);

    for (const item of view.items) {
      expect(item.inspected).toBe(false);
      expect(item.believedAttribute).toBeNull();
      expect(item.believedAttributeLabel).toBeNull();
    }

    // No ground-truth attribute id/label attached to uninspected items
    const leaks = serializedLeaksGroundTruth(state, hospitalityConfig, text);
    expect(leaks).toEqual([]);

    // True attribute must not appear as believedAttribute in JSON
    expect(text).not.toMatch(
      new RegExp(
        `"id": "${seedData.items[0]!.id}"[\\s\\S]{0,200}"believedAttribute": "${hazardish.id}"`,
      ),
    );
  });

  it('reveals attributes only after reInspect beliefs are applied', () => {
    const { seedData } = generateEpisodeSeed(hospitalityConfig, 777, 2);
    const special = hospitalityConfig.itemAttributes.find((a) => a.special)!;
    seedData.items[1] = {
      ...seedData.items[1]!,
      attributeId: special.id,
    };
    const state = createInitialState(seedData, 'llm', hospitalityConfig);

    // Simulate inspect
    for (const it of state.seedData.items) {
      const b = state.beliefs.find((x) => x.itemId === it.id)!;
      b.inspected = true;
      b.attributeId = it.attributeId;
    }

    const view = serializePlannerView(state, hospitalityConfig);
    const target = view.items.find((i) => i.id === seedData.items[1]!.id)!;
    expect(target.inspected).toBe(true);
    expect(target.believedAttribute).toBe(special.id);
    expect(target.believedAttributeLabel).toBe(special.label);
  });
});
