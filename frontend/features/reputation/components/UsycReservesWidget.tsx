'use client';
import { useUsycReserves } from '../hooks/useYield';

/// Live USYC reserves readout. Shows the protocol's real USYC holdings
/// (treasury + vault-routed stake) marked to the live Hashnote price feed,
/// the yield accrued, and the current USYC price. This is the surface that
/// proves USYC is held and growing, distinct from the YieldDistributor tiles
/// (which show USDC distributed to stakers).

function money(n: number | undefined, opts: { dp?: number } = {}): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  const dp = opts.dp ?? (n < 1000 ? 2 : 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function ago(ms: number | null | undefined): string {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function UsycReservesWidget() {
  const { data, isLoading } = useUsycReserves();

  if (data && !data.configured) return null;
  if (data?.error) return null;

  const c = data?.combined;
  const price = data?.price;
  const treasury = data?.treasury;
  const vault = data?.vault;

  const tiles = [
    {
      label: 'USYC reserves',
      value: money(c?.usycValueUsd),
      unit: 'USDC',
      hint: 'Live value of USYC held by the protocol',
    },
    {
      label: 'Yield earned',
      value: money(c?.yieldUsd, { dp: 4 }),
      unit: 'USDC',
      hint: 'Appreciation above the USDC subscribed',
    },
    {
      label: 'Idle, awaiting wrap',
      value: money(c?.idleUsdc),
      unit: 'USDC',
      hint: 'Reserve USDC not yet subscribed into USYC',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--lp-border-light)] bg-[var(--lp-border-light)]">
        {tiles.map((t) => (
          <div key={t.label} className="bg-[var(--lp-card)] px-5 py-4 sm:px-6 sm:py-5">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {t.label}
            </p>
            {isLoading ? (
              <div className="mt-1.5 h-[28px] w-3/4 rounded-md bg-[var(--lp-border-light)] animate-pulse" />
            ) : (
              <p className="mt-1.5 font-sans text-[24px] sm:text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[var(--lp-dark)]">
                {t.value}
                <span className="ms-1.5 text-[13px] font-semibold text-[var(--lp-text-muted)] tracking-normal">
                  {t.unit}
                </span>
              </p>
            )}
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--lp-text-sub)]">{t.hint}</p>
          </div>
        ))}
      </div>

      {/* Price + provenance strip */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 rounded-2xl border border-[var(--lp-border-light)] bg-[var(--lp-card)]"
      >
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            USYC price
          </span>
          <span className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--lp-dark)]">
            ${price ? price.markUsd.toFixed(6) : '—'}
          </span>
          {price?.source === 'live' && (
            <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-[var(--lp-accent)]" />
              live Hashnote feed {price.liveRound ? `· round ${price.liveRound}` : ''}{' '}
              {price.liveUpdatedAt ? `· ${ago(price.liveUpdatedAt)}` : ''}
            </span>
          )}
          {price?.source === 'onchain' && (
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
              on-chain oracle
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mono text-[11px] tabular-nums text-[var(--lp-text-sub)]">
          <span>treasury {money(treasury?.usycShares, { dp: 2 })} USYC</span>
          <span>
            {vault && vault.usycShares > 0
              ? `vault ${money(vault.usycShares, { dp: 2 })} USYC`
              : 'vault not wrapped'}
          </span>
        </div>
      </div>

      {price?.onchainStale && (
        <p className="text-[11px] leading-snug text-[var(--lp-text-muted)]">
          The on-chain Arc Testnet oracle is paused, so reserves are marked to the live Hashnote
          feed. Mainnet reads the oracle directly.
        </p>
      )}
    </div>
  );
}
