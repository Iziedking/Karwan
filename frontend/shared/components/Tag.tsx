import type { ReactNode } from 'react';

type Tone = 'default' | 'positive' | 'warning' | 'critical' | 'accent' | 'muted';

const toneClass: Record<Tone, string> = {
  default: 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] border-[var(--color-line)]',
  positive: 'bg-[var(--color-positive-soft)] text-[var(--color-positive)] border-[var(--color-positive)]/20',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/25',
  critical: 'bg-[var(--color-critical-soft)] text-[var(--color-critical)] border-[var(--color-critical)]/25',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/15',
  muted: 'bg-transparent text-[var(--color-ink-faint)] border-[var(--color-line)]',
};

export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium tracking-tight ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = 'default' }: { tone?: Tone }) {
  const colors: Record<Tone, string> = {
    default: 'bg-[var(--color-ink-faint)]',
    positive: 'bg-[var(--color-positive)]',
    warning: 'bg-[var(--color-warning)]',
    critical: 'bg-[var(--color-critical)]',
    accent: 'bg-[var(--color-accent)]',
    muted: 'bg-[var(--color-ink-faint)]',
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[tone]}`} />;
}
