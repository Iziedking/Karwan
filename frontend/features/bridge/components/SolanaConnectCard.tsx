'use client';
import { useState } from 'react';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
import { USDC_FAUCET, SOLANA_GAS_FAUCET, SOLANA_MIN_SOL } from '../config';
import type { Messages } from '@/shared/i18n/messages/en';
import type { SolanaWallet } from '../hooks/useSolanaWallet';

const PANEL = {
  background: 'var(--lp-card)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomLeftRadius: 12,
  borderBottomRightRadius: 3,
} as const;

/// Non-custodial Solana funding. The user connects their own Solana wallet
/// (Phantom) and will sign the burn there in Slice B. This card replaces the
/// old custodial "fund a deposit address" banner. In Slice A it connects and
/// shows the balance; the transfer itself is wired next.
export function SolanaConnectCard({
  wallet,
  copy,
}: {
  wallet: SolanaWallet;
  copy: Messages['bridgeCard']['solana'];
}) {
  // Faucet helpers copy the connected Solana address, then open the faucet in a
  // new tab so the user pastes it there (mirrors the profile wallet faucets).
  const [copied, setCopied] = useState<'usdc' | 'gas' | null>(null);
  const needsGas = wallet.solBalance !== null && wallet.solBalance < SOLANA_MIN_SOL;
  async function copyAndOpen(url: string, key: 'usdc' | 'gas') {
    if (wallet.address) {
      try {
        await navigator.clipboard.writeText(wallet.address);
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
      } catch {
        /* clipboard can fail in unfocused tabs; still open the faucet */
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="relative mb-4 overflow-hidden px-4 py-3 ps-5" style={PANEL}>
      <span aria-hidden className="absolute start-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--lp-accent)' }} />
      <div className="flex items-center gap-2">
        <ChainLogo chain="solana" size={18} />
        <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
          {copy.eyebrow}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-[var(--lp-text-sub)]">{copy.blurb}</p>

      {/* A different Solana wallet has claimed window.solana. Say which one, so
          the user can act, instead of showing "install Phantom" while Phantom is
          sitting right there disabled, or worse, handing it the burn and letting
          its confirm dialog hang. */}
      {!wallet.available && wallet.conflictingWallet && (
        <p className="mt-2 text-[12px] leading-snug" style={{ color: '#b25425' }}>
          {copy.conflictTemplate.replace('{wallet}', wallet.conflictingWallet)}
        </p>
      )}

      {!wallet.available ? (
        <a
          href="https://phantom.com/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] font-bold px-3 py-1.5"
          style={{
            background: 'var(--lp-accent)',
            color: 'var(--lp-band-dark)',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          {copy.install}
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </a>
      ) : !wallet.address ? (
        <button
          type="button"
          onClick={() => void wallet.connect()}
          disabled={wallet.connecting}
          className="mt-3 inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 disabled:opacity-50"
          style={{
            background: 'var(--lp-accent)',
            color: 'var(--lp-band-dark)',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          {wallet.connecting ? copy.connecting : copy.connect}
        </button>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
                {copy.connected}
              </p>
              <p className="mt-0.5 mono text-[12px] tabular-nums text-[var(--lp-dark)] truncate">
                {shortAddress(wallet.address)}
              </p>
            </div>
            <div className="text-end shrink-0">
              <p className="font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
                {wallet.usdcBalance == null ? '—' : formatUsdc(wallet.usdcBalance, { withSuffix: false })}
                <span className="ms-1 mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  USDC
                </span>
              </p>
              {/* SOL was invisible here, and it is the balance that decides
                  whether the transfer can happen at all. */}
              <p
                className="mt-1 mono text-[10px] tabular-nums uppercase tracking-[0.12em]"
                style={{ color: needsGas ? '#b25425' : 'var(--lp-text-muted)' }}
              >
                {wallet.solBalance == null ? '—' : wallet.solBalance.toFixed(4)} SOL
              </p>
            </div>
          </div>

          {/* Without SOL the burn cannot be simulated, so Phantom opens with an
              empty preview and Confirm greyed out. Say so before they get there. */}
          {needsGas && (
            <p className="mt-2.5 text-[12px] leading-snug" style={{ color: '#b25425' }}>
              {copy.needsSol}
            </p>
          )}
          {/* Faucets: copy the connected address and open the faucet page, so
              the user pastes it there to claim devnet USDC (Circle) or SOL gas. */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void copyAndOpen(USDC_FAUCET, 'usdc')}
              className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2.5 py-1"
              style={{
                background: 'var(--lp-accent)',
                color: 'var(--lp-band-dark)',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {copied === 'usdc' ? copy.copied : copy.getUsdc}
              <ExternalIcon />
            </button>
            <button
              type="button"
              onClick={() => void copyAndOpen(SOLANA_GAS_FAUCET, 'gas')}
              className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2.5 py-1 border transition-colors"
              style={{
                borderColor: 'var(--lp-accent)',
                color: 'var(--lp-band-dark)',
                background: 'rgba(175, 201, 91, 0.18)',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {copied === 'gas' ? copy.copied : copy.getGas}
              <ExternalIcon />
            </button>
            <button
              type="button"
              onClick={() => void wallet.disconnect()}
              className="ms-auto mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
            >
              {copy.disconnect}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
