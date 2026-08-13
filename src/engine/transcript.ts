import type { ActionRecord, Scorecard, TaskConfig } from '../types';
import type { SerializedPlannerView } from './planner/serialize';
import type { LlmActionJson } from './planner/llm';

export const TRANSCRIPT_SCHEMA_VERSION = 1 as const;

export type TranscriptSource = 'manual' | 'llm' | 'preset';

export interface TranscriptStep {
  /** 0-based index in the recording; payload is pre-action. */
  index: number;
  /** Exact `formatPlannerUserMessage` string the model would receive. */
  payloadText: string;
  payload: SerializedPlannerView;
  action: LlmActionJson;
  validationError: string | null;
  applied: boolean;
  outcome: {
    step: number;
    success: boolean;
    motor: boolean;
    observation?: string;
    executorLines: string[];
    record: ActionRecord | null;
  } | null;
}

export interface EpisodeTranscript {
  schemaVersion: typeof TRANSCRIPT_SCHEMA_VERSION;
  source: TranscriptSource;
  episodeId: string;
  masterSeed: number;
  domain: string;
  domainLabel: string;
  maxSteps: number;
  modelId?: string;
  presetId?: string;
  steps: TranscriptStep[];
  scorecard: Scorecard | null;
  endedBy: 'finish' | 'escalate' | 'step-cap' | 'in-progress';
}

export function transcriptEndedBy(
  score: Scorecard | null,
  done: boolean,
): EpisodeTranscript['endedBy'] {
  if (!done || !score) return 'in-progress';
  if (score.stepsExhausted) return 'step-cap';
  if (score.escalated) return 'escalate';
  return 'finish';
}

export function transcriptToMarkdown(
  t: EpisodeTranscript,
  config: TaskConfig,
): string {
  const lines: string[] = [
    `# ${t.episodeId} transcript`,
    '',
    `- domain: ${t.domain} (${t.domainLabel})`,
    `- seed: ${t.masterSeed}`,
    `- source: ${t.source}${t.presetId ? ` / ${t.presetId}` : ''}`,
    `- maxSteps: ${t.maxSteps}`,
    `- endedBy: ${t.endedBy}`,
    '',
    `## Instruction`,
    '',
    config.instruction,
    '',
    `## Steps`,
    '',
  ];
  for (const s of t.steps) {
    lines.push(`### ${s.index + 1}. ${s.action.action}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(s.action, null, 2));
    lines.push('```');
    if (s.validationError) {
      lines.push('');
      lines.push(`Validation: ${s.validationError}`);
    }
    if (s.outcome) {
      lines.push('');
      lines.push(
        `Outcome step ${s.outcome.step}: ${s.outcome.success ? 'ok' : 'fail'}${s.outcome.motor ? ' (motor)' : ''}`,
      );
      for (const l of s.outcome.executorLines) {
        lines.push(`- ${l}`);
      }
    }
    lines.push('');
  }
  lines.push(`## Scorecard`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(t.scorecard, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

export function parseTranscriptJson(raw: unknown): EpisodeTranscript | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<EpisodeTranscript>;
  if (o.schemaVersion !== TRANSCRIPT_SCHEMA_VERSION) return null;
  if (typeof o.episodeId !== 'string') return null;
  if (!Array.isArray(o.steps)) return null;
  return o as EpisodeTranscript;
}
