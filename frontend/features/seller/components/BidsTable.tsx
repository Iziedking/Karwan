'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type SellerActiveBid } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { shortHash, formatUsdc } from '@/shared/utils/format';
import { Icon } from '@/shared/components/Icon';

export function BidsTable({
  bids,
  onAbandon,
}: {
  bids: SellerActiveBid[];
  /// Called after the server confirms a bid was abandoned, so the parent can
  /// drop it from its list immediately.
  onAbandon?: (jobId: string) => void;
}) {
  const router = useRouter();
  const bt = useTranslations().bidsTable;
  const { dismissed, dismiss } = useDismissed('seller-bids');
  const visible = bids.filter((b) => !dismissed.has(b.jobId));
  // Two-step abandon: first click arms the confirm, second calls the server.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function doAbandon(jobId: string) {
    setBusy(jobId);
    try {
      await api.abandonBid(jobId);
      onAbandon?.(jobId);
    } catch {
      // A failed abandon just leaves the row in place; the agent keeps it.
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  if (visible.length === 0) {
    return (
      <div className="py-10 text-center text-[14px] font-medium text-[var(--lp-text-muted)]">
        {bids.length === 0 ? bt.empty.idle : bt.empty.dismissed}
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-[var(--lp-border-light)] md:hidden">
        {visible.map((b) => {
          const href = `/jobs/${b.jobId}`;
          return (
            <article key={b.jobId} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--lp-text-muted)]">{bt.columns.job}</p>
                  <p className="mt-1 mono text-[14px] tabular-nums text-[var(--lp-dark)]">{shortHash(b.jobId, 8, 4)}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2">
                  <StatusDot tone={b.finalized ? 'positive' : 'accent'} />
                  <Tag tone={b.finalized ? 'positive' : 'accent'}>
                    {b.finalized ? bt.status.finalized : bt.status.negotiating}
                  </Tag>
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-[var(--lp-border-light)] py-3">
                <div className="min-w-0">
                  <dt className="text-[13px] font-medium text-[var(--lp-text-muted)]">{bt.columns.buyer}</dt>
                  <dd className="mt-1 truncate mono text-[14px] tabular-nums text-[var(--lp-text-sub)]">{shortHash(b.jobBuyer, 6, 4)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[13px] font-medium text-[var(--lp-text-muted)]">{bt.columns.bid}</dt>
                  <dd className="mt-1 font-sans text-[16px] font-extrabold tabular-nums text-[var(--lp-dark)]">{formatUsdc(b.lastBidPrice)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[13px] font-medium text-[var(--lp-text-muted)]">{bt.columns.rounds}</dt>
                  <dd className="mt-1 mono text-[14px] tabular-nums text-[var(--lp-text-sub)]">{b.counterRounds}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between gap-2">
                {b.finalized ? (
                  <button
                    type="button"
                    aria-label={bt.row.dismissAria}
                    onClick={() => dismiss(b.jobId)}
                    className="inline-flex min-h-11 items-center px-2 text-[13px] font-medium text-[var(--lp-text-muted)]"
                  >
                    {bt.row.dismissTitle}
                  </button>
                ) : confirming === b.jobId ? (
                  <button
                    type="button"
                    disabled={busy === b.jobId}
                    onClick={() => void doAbandon(b.jobId)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-[#ff8a7a]/40 px-3 text-[13px] font-semibold text-[#ff8a7a] disabled:opacity-50"
                  >
                    {busy === b.jobId ? '…' : bt.row.abandonConfirm}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(b.jobId)}
                    className="inline-flex min-h-11 items-center px-2 text-[13px] font-medium text-[var(--lp-text-muted)]"
                  >
                    {bt.row.abandon}
                  </button>
                )}
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-semibold text-[var(--lp-accent-on-light)]"
                >
                  {bt.row.open}<Icon name="arrow-right" size={16} directional />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[13px] font-medium text-[var(--lp-text-muted)] border-b border-[var(--lp-border-light)]">
            <th className="text-start font-medium px-5 py-3">{bt.columns.job}</th>
            <th className="text-start font-medium px-5 py-3">{bt.columns.buyer}</th>
            <th className="text-start font-medium px-5 py-3">{bt.columns.bid}</th>
            <th className="text-start font-medium px-5 py-3">{bt.columns.rounds}</th>
            <th className="text-start font-medium px-5 py-3">{bt.columns.status}</th>
            <th className="text-end font-medium px-5 py-3">{bt.columns.open}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((b) => {
            const href = `/jobs/${b.jobId}`;
            const go = () => router.push(href);
            const onPrefetch = () => router.prefetch(href);
            return (
              <tr
                key={b.jobId}
                onClick={go}
                onMouseEnter={onPrefetch}
                onFocus={onPrefetch}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go();
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={bt.row.openJobAria.replace('{id}', shortHash(b.jobId, 8, 4))}
                className="group cursor-pointer border-b border-[var(--lp-border-light)] last:border-0 hover:bg-[var(--lp-light)] focus:bg-[var(--lp-light)] focus:outline-none transition-colors"
              >
                <td className="px-5 py-3.5 mono text-[14px] tabular-nums text-[var(--lp-dark)]">
                  {shortHash(b.jobId, 8, 4)}
                </td>
                <td className="px-5 py-3.5 mono text-[14px] tabular-nums text-[var(--lp-text-sub)]">
                  {shortHash(b.jobBuyer, 6, 4)}
                </td>
                <td className="px-5 py-3.5 font-sans font-extrabold tabular-nums text-[15px] tracking-[-0.01em] text-[var(--lp-dark)]">
                  {formatUsdc(b.lastBidPrice)}
                </td>
                <td className="px-5 py-3.5 mono tabular-nums text-[var(--lp-text-sub)]">{b.counterRounds}</td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-2">
                    <StatusDot tone={b.finalized ? 'positive' : 'accent'} />
                    <Tag tone={b.finalized ? 'positive' : 'accent'}>
                      {b.finalized ? bt.status.finalized : bt.status.negotiating}
                    </Tag>
                  </span>
                </td>
                <td className="px-5 py-3.5 text-end">
                  <span className="inline-flex items-center gap-2 justify-end">
                    {b.finalized && (
                      <button
                        type="button"
                        title={bt.row.dismissTitle}
                        aria-label={bt.row.dismissAria}
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(b.jobId);
                        }}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full mono text-[14px] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-light)] transition-colors"
                      >
                        ×
                      </button>
                    )}
                    {!b.finalized &&
                      (confirming === b.jobId ? (
                        <button
                          type="button"
                          disabled={busy === b.jobId}
                          onClick={(e) => {
                            e.stopPropagation();
                            void doAbandon(b.jobId);
                          }}
                          className="text-[13px] font-semibold px-2.5 py-1 rounded-full border border-[#ff8a7a]/40 text-[#ff8a7a] hover:bg-[#ff8a7a]/10 transition-colors disabled:opacity-50"
                        >
                          {busy === b.jobId ? '…' : bt.row.abandonConfirm}
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={`${bt.row.abandon} ${shortHash(b.jobId, 8, 4)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirming(b.jobId);
                          }}
                          className="text-[13px] font-medium px-2.5 py-1 rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-light)] transition-colors"
                        >
                          {bt.row.abandon}
                        </button>
                      ))}
                    <span
                      className="inline-flex items-center gap-1 text-[14px] font-semibold"
                      style={{ color: 'var(--lp-accent-on-light)' }}
                    >
                      {bt.row.open}
                      <Icon name="arrow-right" size={16} directional className="inline-block transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
