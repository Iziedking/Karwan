'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, type DepositRequestPublic } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

/// Requests this account made and requests it paid, so neither disappears once
/// the page moves on. Each row opens the request's own page: waiting links can
/// be shared again from there, paid ones show their receipt.
export function PayLinkHistory({ refreshKey }: { refreshKey: string | null }) {
  const asked = useQuery({ queryKey: ['deposit-requests', 'mine'], queryFn: () => api.listDepositRequests(), refetchInterval: 15_000 });
  const paid = useQuery({ queryKey: ['deposit-requests', 'paid'], queryFn: () => api.paidDepositRequests(), refetchInterval: 15_000 });
  const refetchAsked = asked.refetch;
  useEffect(() => {
    if (refreshKey) void refetchAsked();
  }, [refreshKey, refetchAsked]);
  const copy = useTranslations().payLink.create;
  const mine = asked.data?.requests ?? [];
  const theirs = paid.data?.requests ?? [];
  if (mine.length === 0 && theirs.length === 0) return null;
  return (
    <div className="mt-10 space-y-8">
      {mine.length > 0 ? <Section title={copy.requestedTitle} rows={mine} /> : null}
      {theirs.length > 0 ? <Section title={copy.paidTitle} rows={theirs} /> : null}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: DepositRequestPublic[] }) {
  const copy = useTranslations().payLink.create;
  const { locale } = useLocale();
  const status = (row: DepositRequestPublic) =>
    row.status === 'matched' ? copy.statusPaid : row.status === 'expired' ? copy.statusExpired : row.status === 'cancelled' ? copy.statusCancelled : copy.statusOpen;
  return (
    <section>
      <h2 className="text-[16px] font-semibold text-[var(--lp-dark)]">{title}</h2>
      <ul className="mt-2 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
        {rows.map((row) => (
          <li key={row.requestId}>
            <Link
              href={`/deposit/request/${row.requestId}`}
              className="flex min-h-14 items-center justify-between gap-4 py-3 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">
                  {row.amountUsdc ?? '…'} <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">USDC</span>
                </span>
                <span className="block truncate text-[14px] text-[var(--lp-text-sub)] font-medium">
                  {[row.purpose, new Date(row.paidAt ?? row.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-2 text-[14px] text-[var(--lp-text-sub)] font-medium">
                <span
                  aria-hidden
                  className={cn(
                    'size-2 rounded-full',
                    row.status === 'matched' ? 'bg-[var(--lp-accent)]' : row.status === 'open' ? 'bg-[var(--lp-text-sub)] motion-safe:animate-pulse' : 'bg-[var(--lp-border-light)]',
                  )}
                />
                {status(row)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
