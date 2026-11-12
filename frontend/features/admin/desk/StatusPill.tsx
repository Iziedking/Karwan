import type { ReactNode } from 'react';

export type PillTone = 'red' | 'amber' | 'green' | 'grey';

const TONES: Record<PillTone, { bg: string; fg: string }> = {
  red: { bg: '#3A1C1F', fg: 'var(--d-red)' },
  amber: { bg: '#352A12', fg: 'var(--d-amber)' },
  green: { bg: '#17301F', fg: 'var(--d-green)' },
  grey: { bg: '#24262B', fg: '#B9BCC3' },
};

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-medium leading-[15px]" style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  );
}

export const DOT: Record<PillTone, string> = {
  red: 'var(--d-red)',
  amber: 'var(--d-amber)',
  green: 'var(--d-green)',
  grey: 'var(--d-text-3)',
};
