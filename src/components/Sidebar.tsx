import type { ReactNode } from 'react';
import type { AppView } from '../routing';

interface NavItem {
  id: AppView;
  label: string;
  icon: ReactNode;
}

interface Props {
  view: AppView;
  onView: (v: AppView) => void;
}

function IconLive() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="7" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="18" y="4" width="3" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconResults() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 19V5M4 19h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
      <path d="M7 15v-3M11 15V8M15 15v-5M19 15V6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconEpisodes() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 4h11a1 1 0 0 1 1 1v14l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M10 9h6M10 12h6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconEvals() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5 13.5 13.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconCurves() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 19h18M4 16c3-1 4-8 7-8s3 6 6 6 3-4 4-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconManual() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9h6M9 12h6M9 15h4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconModels() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="14" width="16" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="7.5" r="1" fill="currentColor" />
      <circle cx="8" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { id: 'live', label: 'Live env', icon: <IconLive /> },
  { id: 'results', label: 'Batch results', icon: <IconResults /> },
  { id: 'manual', label: 'Manual run', icon: <IconManual /> },
  { id: 'episodes', label: 'Episode review', icon: <IconEpisodes /> },
  { id: 'evals', label: 'Model evals', icon: <IconEvals /> },
  { id: 'curves', label: 'Learning curves', icon: <IconCurves /> },
  { id: 'models', label: 'Models & keys', icon: <IconModels /> },
];

export function Sidebar({ view, onView }: Props) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={() => onView(item.id)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
