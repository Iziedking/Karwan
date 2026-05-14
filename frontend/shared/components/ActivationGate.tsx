'use client';
import { useState, type ReactNode } from 'react';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from './ActivationModal';

/// Wraps a flow that needs the connected wallet's agent wallets provisioned.
/// Renders children once activated; otherwise shows a locked card that opens
/// the activation modal. When the wallet is not connected, children render as
/// is so the inner flow can show its own connect prompt.
export function ActivationGate({ children }: { children: ReactNode }) {
  const { isConnected, activated, loading, activating, error, agents, activate } =
    useActivation();
  const [open, setOpen] = useState(false);

  if (!isConnected || activated) return <>{children}</>;

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] p-5">
        <p className="text-[12px] text-[var(--color-ink-faint)]">Checking your agent wallets…</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
            style={{ background: 'var(--color-ink)', color: 'var(--color-surface)' }}
            aria-hidden
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <h3 className="text-[14px] font-semibold tracking-tight">Activate to open direct deals</h3>
        </div>
        <p className="text-[12.5px] text-[var(--color-ink-dim)] leading-relaxed">
          Direct deals run on your own Circle agent wallets. Activate once to provision a buyer
          agent and a seller agent for this wallet.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
          className="inline-flex px-4 py-2 rounded-md text-[13px] font-semibold hover:opacity-90 transition-opacity"
        >
          Activate agents
        </button>
      </div>
      <ActivationModal
        open={open}
        onClose={() => setOpen(false)}
        activate={activate}
        activating={activating}
        error={error}
        activated={activated}
        agents={agents}
      />
    </>
  );
}
