'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from '@/core/wagmi';
import { useAuth } from '@/shared/hooks/useAuth';
import { useClipboard } from '@/shared/hooks/useClipboard';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

interface Props {
  open: boolean;
  onClose: () => void;
}

/// The Karwan equivalent of RainbowKit's account modal, for Circle-session
/// users. Shows the bound email, the underlying 0x identity address, a
/// copy-to-clipboard, the live Arc USDC balance, and a sign-out chip.
export function CircleAccountModal({ open, onClose }: Props) {
  const auth = useAuth();
  const t = useTranslations().account.modal;
  const { copied, copy } = useClipboard();
  const { data } = useBalance({
    address: auth.address as `0x${string}` | undefined,
    chainId: arcTestnet.id,
  });
  const [busy, setBusy] = useState(false);

  // Close on the Escape key so the modal behaves like every other dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  if (!open || !auth.address) return null;
  if (typeof document === 'undefined') return null;

  const human = data ? formatUnits(data.value, data.decimals) : null;
  const address = auth.address;

  async function signOut() {
    setBusy(true);
    try {
      await auth.signOut();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.ariaDialog}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden fade-up"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="relative px-6 pt-8 pb-6 text-center">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label={t.ariaClose}
            className="absolute top-3 end-3 inline-flex items-center justify-center w-7 h-7 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div
            aria-hidden
            className="mx-auto inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{
              background: '#0e0e0e',
              border: '1px solid var(--lp-border-light)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M7 17 L10 7 L12 13 L14 7 L17 17"
                stroke="var(--lp-accent)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {auth.email && (
            <p className="mono text-[12px] tracking-[0.04em] text-[var(--lp-text-sub)] mb-1">
              {auth.email}
            </p>
          )}
          <h2 className="font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
            {shortAddress(address)}
          </h2>
          <p className="mt-2 mono text-[12px] tabular-nums text-[var(--lp-text-muted)]">
            {human != null
              ? `${formatUsdc(human, { withSuffix: false })} ${t.balanceSuffix}`
              : `${t.balanceUnknownPrefix}  ${t.balanceSuffix}`}
          </p>
        </div>

        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => copy(address)}
            className="group inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              color: 'var(--lp-dark)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect
                x="4"
                y="4"
                width="9"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="M3 11V3.5C3 3 3.2 3 3.5 3H11"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            {copied ? t.copied : t.copy}
          </button>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-60 disabled:cursor-wait"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              color: 'var(--lp-dark)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M7 4V3.5C7 3 7.2 3 7.5 3H12.5C12.8 3 13 3 13 3.5V12.5C13 13 12.8 13 12.5 13H7.5C7.2 13 7 13 7 12.5V12"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 8H2M2 8L4 6M2 8L4 10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {busy ? t.signingOut : t.signOut}
          </button>
        </div>

        <p className="px-6 pb-5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] text-center leading-relaxed">
          {t.fundHint}
        </p>
      </div>
    </div>,
    document.body,
  );
}
