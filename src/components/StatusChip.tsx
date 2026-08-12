import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
}

export function StatusChip({ children, title }: Props) {
  return (
    <span className="chip" title={title}>
      {children}
    </span>
  );
}
