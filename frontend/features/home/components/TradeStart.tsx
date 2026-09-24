'use client';

import React from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';

export function TradeStart({ business = false, headingId = 'home-heading' }: { business?: boolean; headingId?: string }) {
  const { locale } = useLocale();
  const messages = useTranslations();
  const copy = TRADE_ENTRY_COPY[locale];
  const businessCopy = messages.businessTradeDesk;
  const routes = tradeEntryRoutes(business);
  const actions = business
    ? [
        { id: 'buy', href: routes.buy, title: businessCopy.findSupply, body: businessCopy.findSupplySub },
        { id: 'sell', href: routes.sell, title: businessCopy.postOffer, body: businessCopy.postOfferSub },
      ]
    : [
        { id: 'buy', href: routes.buy, title: copy.buy, body: copy.buyBody },
        { id: 'sell', href: routes.sell, title: copy.sell, body: copy.sellBody },
      ];
  return (
    <div className="min-w-0">
      <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-sub)]">{copy.startHere}</p>
      <h1 id={headingId} className="mt-3 max-w-[18ch] text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--lp-dark)]">
        {business ? businessCopy.title : <>{copy.title}<span className="text-[var(--lp-accent)]">.</span></>}
      </h1>
      <p className="mt-4 max-w-[42ch] text-[14px] leading-6 text-[var(--lp-text-sub)]">{business ? businessCopy.description : copy.body}</p>
      <div className="mt-7 border-y border-[var(--lp-border-light)]" role="list">
        {actions.map((action) => (
          <div
            key={action.id}
            role="listitem"
            className="border-b border-[var(--lp-border-light)] last:border-b-0"
          >
            <Link
              href={action.href}
              className="group flex min-h-[92px] items-center justify-between gap-5 px-1 py-4 text-start transition-colors duration-200 hover:bg-[var(--lp-workspace-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="min-w-0">
                <span className="block text-[19px] font-semibold tracking-[-0.03em] text-[var(--lp-dark)]">{action.title}</span>
                {action.body ? <span className="mt-1 block max-w-[52ch] text-[14px] leading-5 text-[var(--lp-text-sub)]">{action.body}</span> : null}
              </span>
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--lp-border-light)] text-[var(--lp-dark)] transition-colors group-hover:border-[var(--lp-dark)]">→</span>
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={routes.agreement}
          className="inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[var(--lp-dark)] underline decoration-[var(--lp-border-light)] underline-offset-4 transition-colors hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {business ? businessCopy.bringDeal : copy.agreement}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
