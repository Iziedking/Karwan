'use client';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
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
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--lp-band-dark)' }}>
              {copy.wiring}
            </span>
            <button
              type="button"
              onClick={() => void wallet.disconnect()}
              className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
            >
              {copy.disconnect}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
