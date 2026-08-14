import type { CompositeScore } from '../types';

interface Props {
  value: CompositeScore;
  incomplete?: boolean;
  label?: string;
  size?: 'lg' | 'md';
}

export function CompositeNumeral({
  value,
  incomplete,
  label,
  size = 'lg',
}: Props) {
  const c = value.components;
  return (
    <div className={`composite-numeral ${size}${incomplete ? ' incomplete' : ''}`}>
      {incomplete ? <div className="incomplete-banner">INCOMPLETE</div> : null}
      {label ? <div className="composite-label">{label}</div> : null}
      <div className="composite-big" title="Composite 0–100 (deployment-tunable)">
        {value.total}
      </div>
      <div className="composite-subs">
        <span title="items resolved × completion weight">
          completion {c.completion.toFixed(1)}
        </span>
        <span title="safety weight minus per-class penalties">
          safety {c.safety.toFixed(1)}
        </span>
        <span title="manifest mismatch caught, or full credit if none present">
          verification {c.verification.toFixed(1)}
        </span>
        <span title="scaled vs par-steps; 0 if step cap hit">
          efficiency {c.efficiency.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
