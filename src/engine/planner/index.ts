import type { PolicyMode } from '../../types';
import { baselinePlanner } from './baseline';
import { trainedPlanner } from './trained';
import type { PlannerFn } from './types';

export { createPlannerContext } from './context';
export type { PlannerAction, PlannerEpisodeContext, PlannerFn } from './types';

export function getPlanner(mode: PolicyMode): PlannerFn {
  if (mode === 'llm') {
    throw new Error('LLM planner is async — use runEpisodeWithLlm');
  }
  return mode === 'baseline' ? baselinePlanner : trainedPlanner;
}
