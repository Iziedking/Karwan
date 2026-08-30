'use client';

import Link from 'next/link';
import type { MatchProposal } from '@/core/api';
import { MatchRow } from './PendingMatchesBand';
import { labelFor } from './PendingDealsBand';
import type { OpenDirectDeal } from '../hooks/useOpenDeals';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Button } from '@/shared/components/Button';
import { SectionTag } from '@/shared/components/Bands';

export function ProfileOpenDealsPanel({
  address,
  matches,
  directDeals,
  fetchState,
  onRetry,
}: {
  address: string;
  matches: MatchProposal[];
  directDeals: OpenDirectDeal[];
  fetchState: 'idle' | 'loading' | 'success' | 'partial-error' | 'error';
  onRetry: () => void;
}) {
  const t = useTranslations().pending;
  const showError = fetchState === 'error' || fetchState === 'partial-error';

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--lp-border-light)] pb-5">
        <div className="max-w-[54ch]">
          <SectionTag dot="live">{t.deals.sectionTag}</SectionTag>
          <h2 className="mt-3 font-sans text-[28px] font-extrabold uppercase leading-none tracking-[-0.035em] text-[var(--lp-dark)] sm:text-[34px]">
            {t.deals.headline}<span className="text-[var(--lp-accent)]">.</span>
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{t.deals.body}</p>
        </div>
        {showError ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t.matches.retry}
          </Button>
        ) : null}
      </div>

      {showError ? (
        <p role="status" className="border-b border-[var(--lp-border-light)] py-4 text-[13px] text-[var(--lp-text-sub)]">
          {t.matches.loadError}
        </p>
      ) : null}

      {matches.length > 0 ? (
        <section aria-label={t.matches.sectionTag}>
          {directDeals.length > 0 ? (
            <h3 className="border-b border-[var(--lp-border-light)] py-3 mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {t.matches.sectionTag}
            </h3>
          ) : null}
          <ul className="divide-y divide-[var(--lp-border-light)]">
            {matches.map((proposal) => (
              <MatchRow
                key={proposal.jobId}
                proposal={proposal}
                viewerAddress={address}
                tone="light"
              />
            ))}
          </ul>
        </section>
      ) : null}

      {directDeals.length > 0 ? (
        <section aria-label={t.deals.sectionTag}>
          {matches.length > 0 ? (
            <h3 className="border-y border-[var(--lp-border-light)] py-3 mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {t.deals.sectionTag}
            </h3>
          ) : null}
          <ul className="divide-y divide-[var(--lp-border-light)]">
            {directDeals.map((item) => {
              const state = labelFor(item.stage, item.isBuyer, t.chips);
              if (!state) return null;
              const role = item.isBuyer ? t.card.roleBuyer : t.card.roleSeller;
              const counterRole = item.isBuyer ? t.card.roleSeller : t.card.roleBuyer;
              return (
                <li key={item.deal.jobId}>
                  <Link
                    href={`/deals/${item.deal.jobId}`}
                    className="group grid min-h-20 gap-3 px-1 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block mono text-[10px] uppercase tracking-[0.17em] text-[var(--lp-text-muted)]">
                        [:{role} · {t.card.contextDeal}:]
                      </span>
                      <span className="mt-2 flex flex-wrap items-baseline gap-2">
                        <strong className="font-sans text-[24px] font-extrabold leading-none tracking-[-0.025em] text-[var(--lp-dark)]">
                          {formatUsdc(item.deal.dealAmountUsdc)}
                        </strong>
                        <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                          {t.card.unit}
                        </span>
                        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                          · {counterRole}
                        </span>
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center justify-between gap-3 sm:justify-end">
                      <span
                        className={`mono text-[10px] font-bold uppercase tracking-[0.13em] ${
                          state.kind === 'action'
                            ? 'text-[#56651f]'
                            : 'text-[var(--lp-text-sub)]'
                        }`}
                      >
                        {state.text}
                      </span>
                      <span aria-hidden className="text-[var(--lp-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5">
                        →
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function formatUsdc(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
