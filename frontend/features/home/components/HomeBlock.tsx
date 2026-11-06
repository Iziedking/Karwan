'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { UserProfile } from '@/core/api';
import { DealLinkSheet } from '@/features/market/components/DealLinkPanel';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { homeBlock } from '../homeBlock';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';
import { CARD_PILL, CardGlyph, LitCard, type CardIcon } from './LitCard';

const ICON_CLASS = 'shrink-0 text-[var(--lp-text-sub)]';

/// The one next step on Home, from what the person said in setup (view 38),
/// lit like the assistant card beside it. Its actions are neutral pills:
/// Home's one green button is a deal's move (view 48).
export function HomeBlock({ profile }: { profile: UserProfile }) {
  const { locale } = useLocale();
  const t = TRADE_ENTRY_COPY[locale].block;
  const [linkOpen, setLinkOpen] = useState(false);
  const kind = homeBlock(profile);

  const view: { title: string; body: string; icon: CardIcon } = {
    getPaid: { title: t.getPaid, body: t.getPaidBody, icon: 'link' as const },
    findWork: { title: t.findWork, body: t.findWorkBody, icon: 'search' as const },
    postNeed: { title: t.postNeed, body: t.postNeedBody, icon: 'plus' as const },
    setUp: { title: t.setUp, body: t.setUpBody, icon: 'user' as const },
  }[kind];

  return (
    <LitCard icon={view.icon} title={view.title} body={view.body} titleId="home-next" data-guide="home-start">
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {kind === 'getPaid' ? (
          <>
            <button type="button" onClick={() => setLinkOpen(true)} className={CARD_PILL}><CardGlyph name="link" size={16} className={ICON_CLASS} />{t.sendLink}</button>
            <Link href="/request" className={CARD_PILL}><CardGlyph name="request" size={16} className={ICON_CLASS} />{t.request}</Link>
          </>
        ) : null}
        {kind === 'findWork' ? (
          <>
            <Link href="/market" className={CARD_PILL}><CardGlyph name="search" size={16} className={ICON_CLASS} />{t.seeRequests}</Link>
            <button type="button" onClick={() => setLinkOpen(true)} className={CARD_PILL}><CardGlyph name="link" size={16} className={ICON_CLASS} />{t.sendLink}</button>
          </>
        ) : null}
        {kind === 'postNeed' ? <Link href={tradeEntryRoutes().buy} className={CARD_PILL}><CardGlyph name="plus" size={16} className={ICON_CLASS} />{t.postRequest}</Link> : null}
        {kind === 'setUp' ? <Link href="/start?step=about" className={CARD_PILL}><CardGlyph name="user" size={16} className={ICON_CLASS} />{t.start}</Link> : null}
      </div>
      <DealLinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} />
    </LitCard>
  );
}
