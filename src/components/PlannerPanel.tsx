import { useEffect, useRef } from 'react';
import type { TaskConfig, TraceLine } from '../types';

interface Props {
  config: TaskConfig;
  lines: TraceLine[];
}

export function PlannerPanel({ config, lines }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <section
      id="live-panel-planner"
      className="panel planner-panel"
      aria-label="Planner stream"
    >
      <div className="panel-header planner">{config.meta.plannerHeader}</div>
      <div className="panel-body">
        <div className="log">
          {lines.length === 0 && (
            <div className="log-empty">Planner idle — awaiting instruction grounding…</div>
          )}
          {lines.map((l) => (
            <div key={l.id} className="log-line planner">
              {l.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </section>
  );
}
