'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';

/// Compact protocol-yield readout for the /stake page. Pulls totals from
/// the YieldDistributor: how much yield has been credited overall, how
/// much already claimed, what's still outstanding, and the live USDC
/// float backing it. Refreshes every 30s.

interface ProtocolReserves {
  totalCreditedUsdc: string;
  totalClaimedUsdc: string;
  outstandingUsdc: string;
  usdcBalance: string;
}

function fmt(s: string | undefined): string {
  if (!s) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function ReservesWidget() {
  const [data, setData] = useState<ProtocolReserves | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await api.yieldProtocol();
        if (cancelled) return;
        if (!r.configured) {
          setConfigured(false);
          return;
        }
        setConfigured(true);
        setData({
          totalCreditedUsdc: r.totalCreditedUsdc ?? '0',
          totalClaimedUsdc: r.totalClaimedUsdc ?? '0',
          outstandingUsdc: r.outstandingUsdc ?? '0',
          usdcBalance: r.usdcBalance ?? '0',
        });
      } catch {
        // keep last good value; widget falls back to "—" if first load fails
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (configured === false) return null;

  const tiles: Array<{ label: string; value: string; hint: string }> = [
    {
      label: 'Distributed',
      value: fmt(data?.totalCreditedUsdc),
      hint: 'Lifetime yield credited to stakers',
    },
    {
      label: 'Claimed',
      value: fmt(data?.totalClaimedUsdc),
      hint: 'Withdrawn by stakers to date',
    },
    {
      label: 'Outstanding',
      value: fmt(data?.outstandingUsdc),
      hint: 'Accrued, awaiting claim',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--lp-border-light)] bg-[var(--lp-border-light)]">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="bg-[var(--lp-card)] px-5 py-4 sm:px-6 sm:py-5"
        >
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            {t.label}
          </p>
          <p className="mt-1.5 font-sans text-[24px] sm:text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[var(--lp-dark)]">
            {t.value}
            <span className="ms-1.5 text-[13px] font-semibold text-[var(--lp-text-muted)] tracking-normal">
              USDC
            </span>
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--lp-text-sub)]">
            {t.hint}
          </p>
        </div>
      ))}
    </div>
  );
}
