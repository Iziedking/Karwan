'use client';
import { useEffect } from 'react';
import { shortAddress } from '@/shared/utils/format';

interface ActivationModalProps {
  open: boolean;
  onClose: () => void;
  activate: () => Promise<unknown>;
  activating: boolean;
  error: string | null;
  activated: boolean;
  agents: { buyer: string; seller: string } | null;
}

/// Presentational modal for provisioning a wallet's Circle agent pair. State is
/// owned by the caller via useActivation so the same hook backs the gate and
/// any other entry point.
export function ActivationModal({
  open,
  onClose,
  activate,
  activating,
  error,
  activated,
  agents,
}: ActivationModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !activating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, activating, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklab, var(--color-ink) 32%, transparent)' }}
      onClick={() => !activating && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4">
          <p className="eyebrow">Circle wallets</p>
          <h2 className="display text-[26px] leading-tight mt-1">
            {activated ? 'Agents are active' : 'Activate your agents'}
          </h2>
        </div>

        {activated && agents ? (
          <div className="px-6 pb-6 space-y-4">
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
              Your agent wallets are provisioned. The buyer agent funds escrows and signs
              releases; the seller agent receives payouts on deals where you are the
              counterparty.
            </p>
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] divide-y divide-[var(--color-line)]">
              <AgentRow label="Buyer agent" address={agents.buyer} />
              <AgentRow label="Seller agent" address={agents.seller} />
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
              className="w-full px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-4">
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
              Karwan provisions two Circle Developer-Controlled wallets for this wallet: a
              buyer agent that funds escrows and signs milestone releases, and a seller agent
              that receives payouts and can file an appeal. They sign every on-chain action,
              so you never have to hold gas or approve transactions one by one.
            </p>
            <p className="text-[12px] text-[var(--color-ink-faint)] leading-relaxed">
              One-time setup. You fund the agents from your Arc balance on the profile page.
            </p>
            {error && (
              <div
                className="rounded-md px-3 py-2"
                style={{
                  border: '1px solid color-mix(in oklab, var(--color-critical) 30%, transparent)',
                  background: 'color-mix(in oklab, var(--color-critical) 8%, transparent)',
                }}
              >
                <p className="text-[12px] text-[var(--color-critical)] leading-snug">
                  Activation failed: {error}
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => activate().catch(() => {})}
                disabled={activating}
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="flex-1 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity inline-flex items-center justify-center gap-2"
              >
                {activating && (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {activating ? 'Provisioning wallets…' : 'Activate agents'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={activating}
                className="px-4 py-2.5 rounded-md text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="px-3.5 py-2.5 flex items-baseline justify-between gap-4">
      <span className="eyebrow shrink-0">{label}</span>
      <span className="mono text-[12px] text-[var(--color-ink)]">{shortAddress(address)}</span>
    </div>
  );
}
