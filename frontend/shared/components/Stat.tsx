import type { ReactNode } from 'react';
import { CopyButton } from './CopyButton';

export function Stat({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">{label}</p>
      <p className={`text-[15px] text-[var(--color-ink)] ${mono ? 'mono' : ''}`}>{value}</p>
      {hint && <p className="text-[11px] text-[var(--color-ink-faint)]">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  value,
  copy,
}: {
  label: string;
  value: ReactNode;
  copy?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">{label}</p>
      <p className="text-[13px] mono text-[var(--color-ink)] break-all">
        {value}
        {copy && <CopyButton text={copy} />}
      </p>
    </div>
  );
}
