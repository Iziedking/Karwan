'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';

interface TickerItem {
  value: string;
  label: string;
}

// Static brand facts, shown until the live numbers load (and never fabricated).
const BASE_ITEMS: TickerItem[] = [
  { value: 'ARC TESTNET', label: 'CHAIN 5042002' },
  { value: 'CIRCLE', label: 'USDC · CCTP · WALLETS' },
  { value: 'ERC-8004', label: 'PORTABLE REPUTATION' },
];

/// The live stats ticker. Numbers come from the real on-chain deal feed, so the
/// marquee only ever shows true data.
export function StatsTicker() {
  const [items, setItems] = useState<TickerItem[]>(BASE_ITEMS);

  useEffect(() => {
    let cancelled = false;
    api
      .dealsStats()
      .then((s) => {
        if (cancelled) return;
        setItems([
          { value: s.total.toLocaleString(), label: 'DIRECT DEALS ON CHAIN' },
          { value: s.settled.toLocaleString(), label: 'SETTLED IN FULL' },
          { value: `${s.volumeUsdc.toLocaleString()} USDC`, label: 'MOVED THROUGH ESCROW' },
          ...BASE_ITEMS,
        ]);
      })
      .catch(() => {
        /* keep the static brand facts */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The track is duplicated so translateX(-50%) lands on a seamless loop point.
  const track = [...items, ...items];

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden border-b border-[var(--lp-border-subtle)] bg-[var(--lp-band-dark)]">
      <div
        className="flex w-max items-center"
        style={{ animation: 'marquee 38s linear infinite' }}
      >
        {track.map((it, i) => (
          <span
            key={i}
            className="flex items-center gap-2.5 whitespace-nowrap px-6 py-2.5 mono text-[12px] uppercase tracking-[0.08em] text-white"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
            <span className="font-semibold">{it.value}</span>
            <span className="text-[var(--lp-text-muted)]">[{it.label}]</span>
          </span>
        ))}
      </div>
    </div>
  );
}
