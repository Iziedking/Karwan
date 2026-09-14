'use client';

import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';

export function TradeStart({ business = false, headingId = 'home-heading' }: { business?: boolean; headingId?: string }) {
  const { locale } = useLocale();
  const messages = useTranslations();
  const reduced = useReducedMotion();
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
      <div className="mt-7 grid gap-3 sm:grid-cols-2" role="list">
        {actions.map((action, index) => (
          <motion.div
            key={action.id}
            role="listitem"
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.32, delay: reduced ? 0 : index * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              href={action.href}
              className="group relative flex min-h-[148px] flex-col justify-between gap-5 rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 text-start transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--lp-outline-strong)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-[168px] sm:p-6"
            >
              <span className="flex items-center justify-between gap-3">
                <span aria-hidden className="mono text-[10px] font-bold tracking-[0.14em] text-[var(--lp-text-sub)]">{String(index + 1).padStart(2, '0')}</span>
                <span aria-hidden className="grid size-10 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)] transition-transform duration-200 motion-safe:group-hover:translate-x-1 rtl:rotate-180">→</span>
              </span>
              <span className="min-w-0">
                <span className="block text-[19px] font-semibold tracking-[-0.03em] text-[var(--lp-dark)]">{action.title}</span>
                {action.body ? <span className="mt-1 block max-w-[28ch] text-[12px] leading-5 text-[var(--lp-text-sub)]">{action.body}</span> : null}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--lp-border-light)] pt-4">
        <Link
          href={routes.agreement}
          className="inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[var(--lp-dark)] underline decoration-[var(--lp-border-light)] underline-offset-4 transition-colors hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {business ? businessCopy.bringDeal : copy.agreement}
          <span aria-hidden>→</span>
        </Link>
        <span aria-hidden className="hidden text-[var(--lp-text-muted)] sm:inline">·</span>
        <span className="text-[12px] text-[var(--lp-text-muted)]">{copy.journey.brief} → {copy.journey.match} → {copy.journey.agree} → {copy.journey.settle}</span>
      </div>
    </div>
  );
}
