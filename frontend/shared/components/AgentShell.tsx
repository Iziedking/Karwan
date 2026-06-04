import type { ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function AgentShell({
  role,
  displayName,
  address,
  status,
  rightSlot,
  children,
  footer,
}: {
  role: 'Buyer agent' | 'Seller agent';
  displayName: string;
  address: string;
  status: 'active' | 'idle' | 'offline';
  rightSlot?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const as = useTranslations().agentShell;
  const dot =
    status === 'active'
      ? 'bg-[var(--color-positive)] shadow-[0_0_0_4px_rgba(15,81,50,0.12)]'
      : status === 'idle'
        ? 'bg-[var(--color-warning)]'
        : 'bg-[var(--color-ink-faint)]';
  const roleLabel = role === 'Buyer agent' ? as.role.buyer : as.role.seller;
  const statusLabel =
    status === 'active' ? as.status.active : status === 'idle' ? as.status.idle : as.status.offline;

  return (
    <section
      className="relative rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden"
      style={{ boxShadow: '0 1px 0 rgba(12, 14, 16, 0.04), 0 32px 64px -34px rgba(12, 14, 16, 0.18)' }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-40 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 80% at 100% 0%, rgba(27, 58, 91, 0.10) 0%, transparent 70%), radial-gradient(60% 80% at 0% 0%, rgba(230, 110, 62, 0.06) 0%, transparent 70%)',
        }}
      />
      <header className="relative px-7 pt-6 pb-5 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-line)]">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            <span>{roleLabel}</span>
            <span className="text-[var(--color-ink-faint)]">·</span>
            <span>{statusLabel}</span>
          </div>
          <h2 className="text-[22px] tracking-tight font-semibold text-[var(--color-ink)]">
            {displayName}
          </h2>
          <p className="text-[12px] mono text-[var(--color-ink-faint)] break-all">{address}</p>
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </header>
      <div className="relative px-7 py-5">{children}</div>
      {footer && (
        <footer className="relative px-7 py-3 border-t border-[var(--color-line)] text-[11px] text-[var(--color-ink-faint)] flex items-center justify-between gap-3 bg-[var(--color-surface-2)]/40">
          {footer}
        </footer>
      )}
    </section>
  );
}

export function MetricPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">{label}</p>
      <p className="mt-0.5 text-[14px] mono text-[var(--color-ink)] tabular-nums">{value}</p>
    </div>
  );
}

export function CapabilityRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] text-[var(--color-ink-2)]">
      <span className="mt-1 shrink-0 w-3.5 h-3.5 rounded-full bg-[var(--color-accent-soft)] grid place-items-center">
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5.2L4.2 7.2L8 3"
            stroke="var(--color-accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}

export function ActivateSlot({
  active,
  comingSoonLabel,
}: {
  active: boolean;
  comingSoonLabel?: string;
}) {
  const as = useTranslations().agentShell;
  if (active) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-positive-soft)] text-[var(--color-positive)] text-[12px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
        {as.activate.running}
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-[#0c0e10] text-[#ffffff] text-[12px] font-semibold opacity-60 cursor-not-allowed"
      title={as.activate.tooltip}
    >
      {comingSoonLabel ?? as.activate.connectWallet}
      <span className="px-1.5 py-px rounded bg-white/15 text-[9px] tracking-wide uppercase">
        {as.activate.soonBadge}
      </span>
    </button>
  );
}
