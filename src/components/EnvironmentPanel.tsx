import type { EpisodeState, TaskConfig } from '../types';
import { getAttr, skillByRole } from '../engine/episode';
import { isItemVisible, typeLabel } from '../engine/fulfillment';

interface Props {
  config: TaskConfig;
  state: EpisodeState | null;
  revealActual: boolean;
}

export function EnvironmentPanel({ config, state, revealActual }: Props) {
  const pickId = skillByRole(config, 'pick')?.id ?? 'pick';
  const last = state?.actions[state.actions.length - 1];

  return (
    <section className="panel">
      <div className="panel-header">{config.meta.environmentHeader}</div>
      <div className="instruction-banner">
        <span>INSTR</span>
        {config.instruction}
      </div>
      <div className="panel-body">
        {!state ? (
          <div className="log-empty">Awaiting episode…</div>
        ) : (
          <>
            <div className="env-section">
              <h3>
                {config.manifest.label}
              </h3>
              <div className="manifest-card">
                <div className="row">
                  <span>Claimed count</span>
                  <span>{state.seedData.manifestClaimed}</span>
                </div>
                <div className="row">
                  <span>Actual count</span>
                  <span>
                    {revealActual || state.flags.manifestChecked
                      ? state.seedData.items.length
                      : '—'}
                  </span>
                </div>
                {state.seedData.streamEnabled && (
                  <div className="row">
                    <span>Inbound remaining</span>
                    <span>{state.inboundQueue.length}</span>
                  </div>
                )}
                {state.seedData.orders.length > 0 && (
                  <div className="row">
                    <span>Orders</span>
                    <span>
                      {state.seedData.orders
                        .map(
                          (o) =>
                            `${o.label} (${o.lines.map((l) => `${l.typeId}×${l.count}`).join(', ')})`,
                        )
                        .join(' · ')}
                    </span>
                  </div>
                )}
                <div className="row">
                  <span>Status</span>
                  <span>
                    {!state.flags.manifestChecked
                      ? 'UNVERIFIED'
                      : state.seedData.hasManifestMismatch
                        ? state.flags.manifestMismatchCaught
                          ? 'MISMATCH CAUGHT'
                          : 'MISMATCH MISSED'
                        : 'MATCH'}
                  </span>
                </div>
              </div>
            </div>

            <div className="env-section">
              <h3>
                {config.ui.itemLabelPlural} (
                {state.seedData.streamEnabled && !revealActual
                  ? `${state.visibleItemIds.length} visible / ${state.seedData.items.length}`
                  : state.seedData.items.length}
                )
              </h3>
              <div className="item-grid">
                {state.seedData.items
                  .filter((it) => revealActual || isItemVisible(state, it.id))
                  .map((it) => {
                  const attr = getAttr(config, it.attributeId);
                  const phase = state.itemPhase[it.id];
                  const belief = state.beliefs.find((b) => b.itemId === it.id);
                  const shownType = revealActual || belief?.typeConfirmed
                    ? it.trueType
                    : belief?.believedType ?? it.glanceType;
                  const pickFailing =
                    ((state.failCounts[`${pickId}:${it.id}`] ?? 0) > 0 &&
                      phase !== 'placed' &&
                      phase !== 'aside') ||
                    (last?.kind === 'pick' &&
                      last.itemId === it.id &&
                      last.success === false);
                  const cls = [
                    'item-card',
                    phase === 'aside' ? 'aside' : '',
                    phase === 'placed' ? 'placed' : '',
                    pickFailing ? 'pick-fail' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const chipCls = [
                    'attr-chip',
                    attr.hazard ? 'hazard' : '',
                    attr.special ? 'special' : '',
                    attr.normal ? 'ok' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div key={it.id} className={cls}>
                      <div className="id">
                        {it.label}
                        <div style={{ marginTop: 2, fontSize: 9, opacity: 0.7 }}>
                          {phase?.toUpperCase()}
                        </div>
                      </div>
                      <span className={chipCls}>{attr.chip}</span>
                      {shownType ? (
                        <span className={`attr-chip${belief?.typeConfirmed ? ' ok' : ''}`}>
                          {belief?.typeConfirmed || revealActual ? '' : '~'}
                          {typeLabel(config, shownType)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="env-section">
              <h3>{config.containers.labelPlural}</h3>
              {state.containers.map((c, i) => {
                const over = c.itemIds.length > c.capacity;
                const pct = Math.min(100, (c.itemIds.length / c.capacity) * 100);
                return (
                  <div key={c.id} className="container-card">
                    <div className="row">
                      <span>
                        {c.label ?? `${config.containers.label} #${i + 1}`}
                        {c.orderId ? ` · ${c.orderId}` : ''}
                        {c.committedFoldProfile ? ` · ${c.committedFoldProfile}` : ''}
                      </span>
                      <span>
                        {c.itemIds.length}/{c.capacity}
                        {over ? ' OVER' : ''}
                      </span>
                    </div>
                    <div className={`capacity-bar${over ? ' over' : ''}`}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {state.setAsideIds.length > 0 && (
                <div className="container-card">
                  <div className="row">
                    <span>SET-ASIDE</span>
                    <span>{state.setAsideIds.length}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
