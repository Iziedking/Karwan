'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

interface TickerItem {
  value: string;
  label: string;
}

/// The live stats ticker. Numbers come from the real on-chain deal feed, so the
/// marquee only ever shows true data.
export function StatsTicker() {
  const t = useTranslations().statsTicker;
  // Static brand facts, shown until the live numbers load (and never fabricated).
  const baseItems = useMemo<TickerItem[]>(
    () => [
      { value: 'ARC TESTNET', label: t.staticItems.arcTestnetLabel },
      { value: 'CIRCLE', label: t.staticItems.circleLabel },
      { value: 'ERC-8004', label: t.staticItems.erc8004Label },
    ],
    [t],
  );
  const [items, setItems] = useState<TickerItem[]>(baseItems);

  useEffect(() => {
    let cancelled = false;
    api
      .dealsStats()
      .then((s) => {
        if (cancelled) return;
        setItems([
          { value: s.total.toLocaleString(), label: t.liveLabels.directDealsOnChain },
          { value: s.settled.toLocaleString(), label: t.liveLabels.settledInFull },
          { value: `${s.volumeUsdc.toLocaleString()} USDC`, label: t.liveLabels.movedThroughEscrow },
          ...baseItems,
        ]);
      })
      .catch(() => {
        /* keep the static brand facts */
      });
    return () => {
      cancelled = true;
    };
  }, [t, baseItems]);

  // The track is duplicated so translateX(-50%) lands on a seamless loop point.
  const track = [...items, ...items];

  return (
    <div className="relative left-1/2 w-bleed -translate-x-1/2 overflow-hidden border-b border-[var(--lp-border-subtle)] bg-[var(--lp-band-dark)]">
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
