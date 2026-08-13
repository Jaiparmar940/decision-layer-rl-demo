import { useMemo, useState } from 'react';
import type { TaskConfig } from '../types';
import { SimLabel } from './SimLabel';

interface Props {
  config: TaskConfig;
}

const MODELS = [
  { id: 'trained-scripted', label: 'trained (scripted)', color: '#3dd68c' },
  { id: 'baseline-scripted', label: 'baseline (scripted)', color: '#ff7a18' },
  { id: 'open-small-demo', label: 'open-small-demo', color: '#6eb6ff' },
] as const;

function seriesFor(modelId: string, points: number): number[] {
  const out: number[] = [];
  let y =
    modelId === 'baseline-scripted' ? 0.42 : modelId === 'trained-scripted' ? 0.48 : 0.4;
  const drift =
    modelId === 'baseline-scripted' ? 0.004 : modelId === 'trained-scripted' ? 0.018 : 0.01;
  for (let i = 0; i < points; i++) {
    y = Math.min(0.98, Math.max(0.05, y + drift + Math.sin(i / 4) * 0.01));
    if (modelId === 'baseline-scripted') y = Math.min(y, 0.72);
    out.push(y);
  }
  return out;
}

function pathFrom(values: number[], w: number, h: number, pad: number): string {
  if (values.length === 0) return '';
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - v * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function CurvesView({ config }: Props) {
  const [active, setActive] = useState<string[]>(MODELS.map((m) => m.id));
  const points = 24;
  const series = useMemo(() => {
    return MODELS.map((m) => ({
      ...m,
      values: seriesFor(m.id, points),
    }));
  }, []);

  const w = 720;
  const h = 280;
  const pad = 28;

  const toggle = (id: string) => {
    setActive((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="page-view curves-view">
      <header className="page-hero">
        <div>
          <h1 className="page-h1">LEARNING CURVES</h1>
          <p className="page-sub">
            Illustrative success rate vs training step · {config.meta.domainLabel}
          </p>
        </div>
        <SimLabel />
      </header>

      <div className="curve-legend">
        {MODELS.map((m) => (
          <label key={m.id} className="curve-toggle">
            <input
              type="checkbox"
              checked={active.includes(m.id)}
              onChange={() => toggle(m.id)}
            />
            <span className="swatch" style={{ background: m.color }} />
            {m.label}
          </label>
        ))}
      </div>

      <div className="curve-chart panel-like">
        <svg viewBox={`0 0 ${w} ${h}`} className="curve-svg" role="img" aria-label="Learning curves">
          {[0.25, 0.5, 0.75, 1].map((g) => {
            const y = h - pad - g * (h - pad * 2);
            return (
              <g key={g}>
                <line
                  x1={pad}
                  x2={w - pad}
                  y1={y}
                  y2={y}
                  stroke="var(--border-dim)"
                  strokeWidth="1"
                />
                <text x={8} y={y + 3} fill="var(--text-mute)" fontSize="10">
                  {Math.round(g * 100)}%
                </text>
              </g>
            );
          })}
          {series
            .filter((s) => active.includes(s.id))
            .map((s) => (
              <path
                key={s.id}
                d={pathFrom(s.values, w, h, pad)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
              />
            ))}
          <text x={w / 2} y={h - 6} textAnchor="middle" fill="var(--text-mute)" fontSize="10">
            training step →
          </text>
        </svg>
      </div>
    </div>
  );
}
