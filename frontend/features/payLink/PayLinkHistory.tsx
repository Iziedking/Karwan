'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, type DepositRequestPublic, type RequestPage, type RequestPageResult } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { Icon } from '@/shared/components/Icon';
import { walletAmount } from '@/features/balances/walletFormat';

/// Requests this account made and requests it paid, so neither disappears once
/// the page moves on. Each row opens the request's own page: waiting links can
/// be shared again from there, paid ones show their receipt.
export function PayLinkHistory({ refreshKey }: { refreshKey: string | null }) {
  const asked = useRequestPages('mine', api.listDepositRequests);
  const paid = useRequestPages('paid', api.paidDepositRequests);
  const refetchAsked = asked.refetch;
  useEffect(() => {
    if (refreshKey) void refetchAsked();
  }, [refreshKey, refetchAsked]);
  const copy = useTranslations().payLink.create;
  const mine = asked.data?.pages.flatMap((page) => page.requests) ?? [];
  const theirs = paid.data?.pages.flatMap((page) => page.requests) ?? [];
  if (mine.length === 0 && theirs.length === 0) return null;
  return (
    <div className="mt-10 space-y-8">
      {mine.length > 0 ? <Section title={copy.requestedTitle} rows={mine} pages={asked} /> : null}
      {theirs.length > 0 ? <Section title={copy.paidTitle} rows={theirs} pages={paid} /> : null}
    </div>
  );
}

/// The latest few first; each Show more asks the server for the next page, so
/// every request stays reachable and the page never loads them all at once.
const FIRST_PAGE = 5;
const MORE = 10;

function useRequestPages(key: 'mine' | 'paid', fetchPage: (page: RequestPage) => Promise<RequestPageResult>) {
  return useInfiniteQuery({
    queryKey: ['deposit-requests', key],
    queryFn: ({ pageParam }) => fetchPage({ limit: pageParam ? MORE : FIRST_PAGE, before: pageParam ?? undefined }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next ?? undefined,
    refetchInterval: 15_000,
  });
}

type RequestPages = ReturnType<typeof useRequestPages>;

function Section({ title, rows, pages }: { title: string; rows: DepositRequestPublic[]; pages: RequestPages }) {
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
                  {walletAmount(row.amountUsdc) ?? '…'} <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">USDC</span>
                </span>
                <span className="block truncate text-[14px] text-[var(--lp-text-sub)] font-medium">
                  {[row.purpose, new Date(row.paidAt ?? row.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-2">
                {/* A tinted label, like Discover's: the state reads on its own ground. */}
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[14px] font-semibold',
                    row.status === 'matched'
                      ? 'bg-[var(--color-positive-soft)] text-[var(--color-positive)]'
                      : row.status === 'open'
                        ? 'bg-[var(--tint)] text-[var(--ink)]'
                        : 'bg-[var(--tint)] text-[var(--ink-secondary)]',
                  )}
                >
                  {status(row)}
                </span>
                <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--lp-text-sub)]" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {pages.hasNextPage ? (
        <button
          type="button"
          onClick={() => void pages.fetchNextPage()}
          disabled={pages.isFetchingNextPage}
          aria-busy={pages.isFetchingNextPage}
          className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {copy.showMore}
        </button>
      ) : null}
    </section>
  );
}
