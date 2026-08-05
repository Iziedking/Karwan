'use client';
import { useUsycReserves } from '../hooks/useYield';

/// The USYC price a staker's yield is marked against.
///
/// This used to also show reserves held, yield accrued platform-wide, USDC not
/// yet subscribed, per-contract share counts, the oracle round, its age, and a
/// note about which price source we had fallen back to. None of that is the
/// staker's money or their decision, and "idle, awaiting wrap" only parses if you
/// already know there is a wrap step. It was the protocol's ledger printed on a
/// user's page.
///
/// What is left is the one number that explains why a stake grows.
export function UsycReservesWidget() {
  const { data } = useUsycReserves();

  if (data && !data.configured) return null;
  if (data?.error) return null;

  const price = data?.price;

  return (
    <div
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 px-4 py-4 sm:px-5 rounded-2xl border border-[var(--lp-border-light)] bg-[var(--lp-card)]"
    >
      <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        USYC price
      </span>
      <span className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--lp-dark)]">
        ${price ? price.markUsd.toFixed(4) : '—'}
      </span>
      {price?.source === 'live' ? (
        <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-[var(--lp-accent)]" />
          live
        </span>
      ) : null}
    </div>
  );
}
