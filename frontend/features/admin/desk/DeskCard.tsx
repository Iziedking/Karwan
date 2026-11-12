import type { ReactNode } from 'react';

export function DeskCard({ title, action, children, className }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] ${className ?? ''}`}>
      {title && (
        <header className="flex items-center gap-3 px-4 pb-2 pt-3">
          <h2 className="flex-1 text-[14px] font-semibold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, line, tone }: { label: string; value: ReactNode; line?: ReactNode; tone?: 'red' }) {
  return (
    <div className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] px-4 py-3.5">
      <p className="text-[12px] font-medium text-[var(--d-text-2)]">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold leading-7 ${tone === 'red' ? 'text-[var(--d-red)]' : ''}`}>{value}</p>
      {line && <p className="mt-1 text-[12px] text-[var(--d-text-3)]">{line}</p>}
    </div>
  );
}

/// One label and value on a line, as in a record's details.
export function DetailRow({ label, children, tone }: { label: string; children: ReactNode; tone?: 'red' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-[var(--d-text-2)]">{label}</span>
      <span className={`text-right font-medium ${tone === 'red' ? 'text-[var(--d-red)]' : 'text-[var(--d-text)]'}`}>{children}</span>
    </div>
  );
}
