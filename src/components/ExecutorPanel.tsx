import { useEffect, useRef } from 'react';
import { isPickFailTrace } from '../copy/traces';
import { skillByRole } from '../engine/episode';
import type { TaskConfig, TraceLine } from '../types';

interface Props {
  config: TaskConfig;
  lines: TraceLine[];
}

export function ExecutorPanel({ config, lines }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const pickLabel = skillByRole(config, 'pick')?.label ?? 'pick';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <section
      id="live-panel-executor"
      className="panel executor-panel"
      aria-label="Executor stream"
    >
      <div className="panel-header executor">{config.meta.executorHeader}</div>
      <div className="panel-body">
        <div className="log">
          {lines.length === 0 && (
            <div className="log-empty">Executor idle — no motor primitives dispatched…</div>
          )}
          {lines.map((l) => {
            const obs = l.text.startsWith('OBS:');
            const pickFail = isPickFailTrace(l.text, pickLabel);
            return (
              <div
                key={l.id}
                className={`log-line executor${obs ? ' obs' : ''}${pickFail ? ' fail' : ''}`}
              >
                {l.text}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </section>
  );
}
