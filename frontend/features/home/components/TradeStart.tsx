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
        { id: 'agreement', href: routes.agreement, title: businessCopy.bringDeal, body: businessCopy.bringDealSub },
      ]
    : [
        { id: 'sell', href: routes.sell, title: copy.sell, body: copy.sellBody },
        { id: 'buy', href: routes.buy, title: copy.buy, body: copy.buyBody },
        { id: 'agreement', href: routes.agreement, title: copy.agreement, body: '' },
      ];
  return (
    <div className="min-w-0">
      <h1 id={headingId} className="mt-4 max-w-[18ch] text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--lp-dark)]">
        {business ? businessCopy.title : <>{copy.title}<span className="text-[var(--lp-accent)]">.</span></>}
      </h1>
      <div className="mt-7 grid gap-3" role="list">
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
              className="group flex min-h-[92px] items-center gap-4 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-4 text-start transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--lp-outline-strong)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-[104px] sm:px-5"
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--lp-light)] text-[12px] font-semibold tabular-nums text-[var(--lp-text-sub)]">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{action.title}</span>
                {action.body ? <span className="mt-1 block max-w-[46ch] text-[13px] leading-5 text-[var(--lp-text-sub)]">{action.body}</span> : null}
              </span>
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)] transition-transform duration-200 motion-safe:group-hover:translate-x-1 rtl:rotate-180">→</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
