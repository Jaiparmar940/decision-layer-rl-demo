import { useEffect, useRef } from 'react';
import type { TaskConfig, TraceLine } from '../types';

interface Props {
  config: TaskConfig;
  lines: TraceLine[];
}

export function ExecutorPanel({ config, lines }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <section className="panel">
      <div className="panel-header executor">{config.meta.executorHeader}</div>
      <div className="panel-body">
        <div className="log">
          {lines.length === 0 && (
            <div className="log-empty">Executor idle — no motor primitives dispatched…</div>
          )}
          {lines.map((l) => (
            <div
              key={l.id}
              className={`log-line executor${l.text.startsWith('OBS:') ? ' obs' : ''}`}
            >
              {l.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </section>
  );
}
