'use client';
import { useState, type ReactNode } from 'react';
import { useActivation } from '@/shared/hooks/useActivation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ActivationModal } from './ActivationModal';
import { Button } from './Button';
import { Skeleton, SkeletonText } from './Skeleton';

/// Wraps a flow that needs the connected wallet's agent wallets provisioned.
/// Renders children once activated; otherwise shows a locked card that opens
/// the activation modal. When the wallet is not connected, children render as
/// is so the inner flow can show its own connect prompt.
export function ActivationGate({ children }: { children: ReactNode }) {
  const { isConnected, activated, loading, activating, error, agents, activate, renameAgents } =
    useActivation();
  const t = useTranslations().activation.gate;
  const [open, setOpen] = useState(false);

  if (!isConnected || activated) return <>{children}</>;

  if (loading) {
    return (
      <div className="overflow-hidden rounded-t-[16px] rounded-bl-[16px] rounded-br-[4px] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <span className="sr-only">{t.loading}</span>
        <Skeleton className="h-3 w-28" />
        <SkeletonText lines={2} className="mt-4 max-w-lg" />
      </div>
    );
  }

  return (
    <>
      <section className="overflow-hidden rounded-t-[16px] rounded-bl-[16px] rounded-br-[4px] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] sm:p-6">
        <p className="inline-flex items-center gap-2 mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
          <span aria-hidden className="size-1.5 rounded-[1px] bg-[var(--warn)]" />
          [:AGENT SETUP]
        </p>
        <div className="mt-4 flex items-start gap-3">
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-ink)] text-[var(--color-surface)]"
            aria-hidden
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="font-sans text-[18px] font-bold tracking-[-0.02em] text-[var(--color-ink)]">
              {t.title}
            </h3>
            <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
              {t.body}
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => setOpen(true)} className="mt-5">
          {t.cta}
          <span aria-hidden>→</span>
        </Button>
      </section>
      <ActivationModal
        open={open}
        onClose={() => setOpen(false)}
        activate={activate}
        renameAgents={renameAgents}
        activating={activating}
        error={error}
        activated={activated}
        agents={agents}
      />
    </>
  );
}
