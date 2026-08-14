import { useMemo, useState } from 'react';
import type { ActionKind, TaskConfig } from '../types';
import { hospitalityConfig, foldingConfig } from '../config';
import { ACTION_KINDS } from '../engine/planner/serialize';
import { MOTOR_NEEDS_ITEM, validateLlmAction, type LlmActionJson } from '../engine/planner/llm';
import { presetsForDomain, type PresetKind } from '../engine/presets';
import { useManualRunner } from '../hooks/useManualRunner';
import { GraderReport } from './manual/GraderReport';
import { getAttr } from '../engine/episode';

interface Props {
  domainId: string;
  onDomain: (id: string) => void;
}

const NEEDS_CONTAINER: ActionKind[] = ['place', 'placeIncomplete'];

export function ManualRunView({ domainId, onDomain }: Props) {
  const config: TaskConfig = domainId === 'folding' ? foldingConfig : hospitalityConfig;
  const runner = useManualRunner(config);
  const [seedDraft, setSeedDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [pendingKind, setPendingKind] = useState<ActionKind | null>(null);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [pendingContainer, setPendingContainer] = useState<string | null>(null);
  const [flagIncomplete, setFlagIncomplete] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const presets = presetsForDomain(config.meta.id);
  const { state } = runner;

  const trialDraft = (kind: ActionKind, itemId?: string | null, containerId?: string): LlmActionJson => ({
    action: kind,
    itemId: itemId ?? undefined,
    containerId: NEEDS_CONTAINER.includes(kind) ? containerId : undefined,
    flagIncomplete: kind === 'placeIncomplete' ? flagIncomplete : undefined,
    reason: 'manual tap',
  });

  const kindError = (kind: ActionKind): string | null => {
    if (MOTOR_NEEDS_ITEM.includes(kind) || NEEDS_CONTAINER.includes(kind)) return null;
    return validateLlmAction(trialDraft(kind), state, config);
  };

  const commit = (draft: LlmActionJson) => {
    const err = runner.submit(draft);
    setLastError(err);
    if (!err) {
      setPendingKind(null);
      setPendingItem(null);
      setPendingContainer(null);
    }
  };

  const onKind = (kind: ActionKind) => {
    if (state.done) return;
    const needsItem = MOTOR_NEEDS_ITEM.includes(kind);
    const needsContainer = NEEDS_CONTAINER.includes(kind);
    if (!needsItem && !needsContainer) {
      const err = kindError(kind);
      if (err) {
        setLastError(err);
        return;
      }
      commit(trialDraft(kind));
      return;
    }
    setPendingKind(kind);
    setPendingItem(null);
    setPendingContainer(needsContainer && state.containers.length === 1 ? state.containers[0]!.id : null);
    setLastError(null);
  };

  const tryComplete = (kind: ActionKind, itemId: string | null, containerId: string | null) => {
    const needsItem = MOTOR_NEEDS_ITEM.includes(kind);
    const needsContainer = NEEDS_CONTAINER.includes(kind);
    if (needsItem && !itemId) return;
    if (needsContainer && !containerId) return;
    const draft = trialDraft(kind, itemId, containerId ?? undefined);
    const err = validateLlmAction(draft, state, config);
    if (err) {
      setLastError(err);
      return;
    }
    commit(draft);
  };

  const onItemChip = (id: string) => {
    if (!pendingKind) return;
    setPendingItem(id);
    tryComplete(pendingKind, id, pendingContainer);
  };

  const onContainerChip = (id: string) => {
    if (!pendingKind) return;
    setPendingContainer(id);
    tryComplete(pendingKind, pendingItem, id);
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(runner.payloadText);
    } catch {
      setLastError('clipboard unavailable');
    }
  };

  const loadPreset = (kind: PresetKind | '') => {
    if (!kind) return;
    const fixture = presets.find((p) => p.kind === kind);
    if (fixture) runner.playPreset(fixture);
  };

  const newEp = () => {
    const raw = seedDraft.trim();
    const n = raw === '' ? null : Number(raw);
    runner.newEpisode(n);
    setLastError(null);
    setPendingKind(null);
  };

  const history = runner.steps;

  const itemChips = useMemo(() => state.seedData.items, [state.seedData.items]);

  return (
    <div className="page-view manual-run-view">
      <div className="manual-bar">
        <label>
          Domain
          <select
            value={config.meta.id}
            onChange={(e) => onDomain(e.target.value)}
          >
            <option value="hospitality">hospitality</option>
            <option value="folding">folding</option>
          </select>
        </label>
        <label>
          Seed
          <input
            value={seedDraft}
            onChange={(e) => setSeedDraft(e.target.value)}
            placeholder={`${runner.seed} (blank = random)`}
            inputMode="numeric"
          />
        </label>
        <button type="button" className="primary" onClick={newEp}>
          New episode
        </button>
        <label className="reveal-toggle">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(e) => setReveal(e.target.checked)}
          />
          Reveal
        </label>
        <label>
          Preset
          <select
            defaultValue=""
            onChange={(e) => {
              loadPreset(e.target.value as PresetKind | '');
              e.target.value = '';
            }}
          >
            <option value="">load…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.kind}>
                {p.kind} (seed {p.masterSeed})
              </option>
            ))}
          </select>
        </label>
        {runner.presetPlaying ? (
          <button type="button" onClick={runner.stopPreset}>
            Stop preset
          </button>
        ) : null}
        <label>
          Max steps
          <input
            type="number"
            min={1}
            max={200}
            value={runner.maxSteps}
            onChange={(e) => runner.setMaxSteps(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={runner.download} disabled={history.length === 0}>
          Download
        </button>
        <span className="manual-meta">
          {state.seedData.episodeId} · seed {runner.seed} · step {state.step}/
          {runner.maxSteps}
          {state.done ? ' · ENDED' : ''}
        </span>
      </div>

      {reveal && (
        <div className="reveal-strip" role="status">
          <div className="reveal-kicker">DEBUG REVEAL // GROUND TRUTH VS BELIEF</div>
          <div className="reveal-items">
            {itemChips.map((it) => {
              const belief = state.beliefs.find((b) => b.itemId === it.id);
              const trueA = getAttr(config, it.attributeId);
              const believed =
                belief?.inspected && belief.attributeId
                  ? getAttr(config, belief.attributeId).chip
                  : 'uninspected';
              return (
                <div key={it.id} className="reveal-card">
                  <div className="reveal-id">{it.label}</div>
                  <div>
                    GT <strong>{trueA.chip}</strong>
                  </div>
                  <div>
                    BELIEF <strong>{believed}</strong>
                  </div>
                  <div className="reveal-phase">{state.itemPhase[it.id]}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="manual-panels">
        <section className="manual-panel">
          <div className="panel-header">
            PLANNER PAYLOAD // model input
            <button type="button" onClick={copyPayload}>
              Copy
            </button>
          </div>
          <pre className="payload-pre">{runner.payloadText}</pre>
        </section>

        <section className="manual-panel">
          <div className="panel-header">ACTIONS</div>
          <div className="action-kinds">
            {ACTION_KINDS.map((kind) => {
              const err = kindError(kind);
              const active = pendingKind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  className={active ? 'active' : ''}
                  disabled={state.done || Boolean(err)}
                  title={err ?? kind}
                  onClick={() => onKind(kind)}
                >
                  {kind}
                </button>
              );
            })}
          </div>
          {pendingKind === 'placeIncomplete' && (
            <label className="flag-toggle">
              <input
                type="checkbox"
                checked={flagIncomplete}
                onChange={(e) => setFlagIncomplete(e.target.checked)}
              />
              flagIncomplete
            </label>
          )}
          {pendingKind && (
            <div className="two-tap">
              <div className="two-tap-hint">
                {MOTOR_NEEDS_ITEM.includes(pendingKind)
                  ? 'Tap an item chip'
                  : null}
                {NEEDS_CONTAINER.includes(pendingKind) ? ' + container chip' : null}
              </div>
              <div className="chip-row">
                {itemChips.map((it) => {
                  const draft = trialDraft(
                    pendingKind,
                    it.id,
                    NEEDS_CONTAINER.includes(pendingKind)
                      ? (pendingContainer ?? state.containers[0]?.id)
                      : undefined,
                  );
                  const err = validateLlmAction(draft, state, config);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`item-chip${pendingItem === it.id ? ' active' : ''}`}
                      disabled={Boolean(err)}
                      title={err ?? it.id}
                      onClick={() => onItemChip(it.id)}
                    >
                      {it.label}
                    </button>
                  );
                })}
              </div>
              {NEEDS_CONTAINER.includes(pendingKind) && (
                <div className="chip-row">
                  {state.containers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`item-chip${pendingContainer === c.id ? ' active-green' : ''}`}
                      onClick={() => onContainerChip(c.id)}
                    >
                      {c.id} {c.itemIds.length}/{c.capacity}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {lastError && <div className="manual-error">{lastError}</div>}
          <ol className="action-history">
            {history.map((s, i) => (
              <li
                key={s.index}
                className={runner.presetCursor === i ? 'cursor' : ''}
              >
                <span className="hist-step">{s.outcome?.step ?? s.index + 1}</span>
                <span>
                  {s.action.action}
                  {s.action.itemId ? ` ${s.action.itemId}` : ''}
                  {s.action.containerId ? ` → ${s.action.containerId}` : ''}
                </span>
                <span className={s.outcome?.success === false ? 'bad' : ''}>
                  {s.outcome?.success === false ? 'fail' : s.applied ? 'ok' : 'blocked'}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="manual-panel">
          <div className="panel-header executor">EXECUTOR / OBS</div>
          <div className="obs-log">
            {state.executorLines.map((l) => (
              <div key={l.id} className="obs-line">
                {l.step != null ? <span className="hist-step">{l.step}</span> : null}
                {l.text}
              </div>
            ))}
          </div>
        </section>
      </div>

      {runner.evidence && (
        <GraderReport evidence={runner.evidence} config={config} />
      )}
    </div>
  );
}
