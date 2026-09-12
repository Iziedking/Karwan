'use client';

import React from 'react';
import Link from 'next/link';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';

export function TradeStart({ business = false, headingId = 'home-heading' }: { business?: boolean; headingId?: string }) {
  const { locale } = useLocale();
  const copy = TRADE_ENTRY_COPY[locale];
  const routes = tradeEntryRoutes(business);
  return (
    <div className="min-w-0">
      <h1 id={headingId} className="mt-4 max-w-[18ch] text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--lp-dark)]">{copy.title}</h1>
      <p className="mt-4 max-w-[54ch] text-[15px] leading-6 text-[var(--lp-text-sub)]">{copy.body}</p>
      <div className="mt-7 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
        {(['sell', 'buy'] as const).map((intent) => (
          <Link key={intent} href={routes[intent]} className="group flex min-h-11 items-center justify-between gap-4 py-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
            <span className="min-w-0">
              <span className="block text-[19px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{copy[intent]}</span>
              <span className="mt-1 block max-w-[47ch] text-[13px] leading-5 text-[var(--lp-text-sub)]">{business && intent === 'buy' ? copy.businessBuyBody : copy[`${intent}Body`]}</span>
            </span>
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)] transition-transform motion-safe:group-hover:translate-x-0.5 rtl:rotate-180">→</span>
          </Link>
        ))}
      </div>
      <Link href={routes.agreement} className="mt-3 inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[var(--lp-dark)] underline decoration-[var(--lp-border-light)] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">{copy.agreement}<span aria-hidden>→</span></Link>
      <p className="mt-3 max-w-[58ch] text-[12px] leading-5 text-[var(--lp-text-sub)]">{copy.scope}</p>
    </div>
  );
}
