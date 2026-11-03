'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { UserProfile } from '@/core/api';
import { DealLinkSheet } from '@/features/market/components/DealLinkPanel';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { SECONDARY } from '@/shared/ui/controls';
import { buttonClasses } from '@/shared/components/Button';

/// The card's first move. Secondary: Home's one green button is a deal's move (view 48).
const FIRST = buttonClasses({ variant: 'secondary', size: 'lg' });
import { homeBlock } from '../homeBlock';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';

/// The one next step on Home, from what the person said in setup (view 38).
export function HomeBlock({ profile }: { profile: UserProfile }) {
  const { locale } = useLocale();
  const t = TRADE_ENTRY_COPY[locale].block;
  const [linkOpen, setLinkOpen] = useState(false);
  const kind = homeBlock(profile);

  const view = {
    getPaid: { title: t.getPaid, body: t.getPaidBody },
    findWork: { title: t.findWork, body: t.findWorkBody },
    postNeed: { title: t.postNeed, body: t.postNeedBody },
    setUp: { title: t.setUp, body: t.setUpBody },
  }[kind];

  return (
    <section data-guide="home-start" aria-labelledby="home-next" className="flex flex-col rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6">
      <h2 id="home-next" className="text-[19px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{view.title}</h2>
      <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{view.body}</p>
      <div className="mt-auto flex flex-wrap gap-2.5 pt-5">
        {kind === 'getPaid' ? (
          <>
            <button type="button" onClick={() => setLinkOpen(true)} className={FIRST}>{t.sendLink}</button>
            <Link href="/request" className={SECONDARY}>{t.request}</Link>
          </>
        ) : null}
        {kind === 'findWork' ? (
          <>
            <Link href="/market" className={FIRST}>{t.seeRequests}</Link>
            <button type="button" onClick={() => setLinkOpen(true)} className={SECONDARY}>{t.sendLink}</button>
          </>
        ) : null}
        {kind === 'postNeed' ? <Link href={tradeEntryRoutes().buy} className={FIRST}>{t.postRequest}</Link> : null}
        {kind === 'setUp' ? <Link href="/start?step=about" className={FIRST}>{t.start}</Link> : null}
      </div>
      <DealLinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} />
    </section>
  );
}
