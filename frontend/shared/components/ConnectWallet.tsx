'use client';
import { useState } from 'react';

export function ConnectWalletButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
        className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 7h12M10 10h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Connect wallet
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[420px] max-w-[90vw] rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] shadow-2xl p-6 space-y-5"
          >
            <div>
              <h3 className="text-[18px] font-semibold tracking-tight">Connect your wallet</h3>
              <p className="text-[13px] text-[var(--color-ink-dim)] mt-1">
                Choose how you want to sign onto Arc.
              </p>
            </div>
            <div className="space-y-2">
              <Option title="Circle passkey" subtitle="Email + device biometrics. No seed phrase." soon />
              <Option title="Browser wallet" subtitle="MetaMask, Rabby, Coinbase Wallet." soon />
              <Option title="WalletConnect" subtitle="Scan with any WalletConnect-compatible mobile wallet." soon />
            </div>
            <p className="text-[11px] text-[var(--color-ink-faint)] pt-2 border-t border-[var(--color-line)]">
              Wallet connect ships with v1. Today's demo uses a pre-provisioned Circle Dev-Controlled wallet so the deal flow is unblocked.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Option({ title, subtitle, soon }: { title: string; subtitle: string; soon?: boolean }) {
  return (
    <button
      type="button"
      disabled={soon}
      className="w-full text-left flex items-start justify-between gap-3 px-4 py-3 rounded-md border border-[var(--color-line)] hover:border-[var(--color-ink)] disabled:hover:border-[var(--color-line)] disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
    >
      <div>
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[12px] text-[var(--color-ink-dim)]">{subtitle}</p>
      </div>
      {soon && (
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]">
          v1
        </span>
      )}
    </button>
  );
}
