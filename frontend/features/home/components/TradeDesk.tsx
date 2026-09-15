'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages';
import { formatUsdc, shortAddress } from '@/shared/utils/format';
import { stageOf } from '@/features/deals/components/DirectDealList';
import { labelFor } from '@/features/notifications/components/PendingDealsBand';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';

type TradeDeskProps = { business?: boolean };

export function TradeDesk({ business = false }: TradeDeskProps) {
  const { locale } = useLocale();
  const reduced = useReducedMotion();
  const auth = useAuth();
  const translations = useTranslations();
  const copy = TRADE_ENTRY_COPY[locale].desk;
  const routes = tradeEntryRoutes(business);
  const { deals, fetchState, refresh } = useDirectDeals();
  const viewer = auth.address?.toLowerCase() ?? '';
  const activeDeals = deals.filter((deal) => {
    const stage = stageOf(deal);
    return stage !== 'settled' && stage !== 'cancelled';
  });

  const lanes = [
    {
      index: '01',
      href: '/buyer?mode=managed#new-deal',
      label: copy.findWork,
      body: copy.findWorkBody,
      accent: true,
    },
    {
      index: '02',
      href: routes.sell,
      label: copy.findClients,
      body: copy.findClientsBody,
      accent: false,
    },
  ];

  return (
    <div className="trade-desk mx-auto w-full max-w-[1080px] pb-12 sm:pb-16" data-ui="trade-desk">
      <motion.header
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="trade-desk-header"
      >
        <div>
          <p className="trade-desk-eyebrow">{copy.eyebrow}</p>
          <h1 id="trade-desk-heading" className="trade-desk-title">{copy.title}<span aria-hidden className="text-[var(--lp-accent)]">.</span></h1>
          <p className="trade-desk-intro">{copy.body}</p>
        </div>
        <div className="trade-desk-pulse" aria-live="polite">
          <span aria-hidden className={fetchState === 'loading' ? 'trade-desk-pulse-dot is-loading' : 'trade-desk-pulse-dot'} />
          <span>{activeDeals.length > 0 ? `${activeDeals.length} ${copy.active.toLowerCase()}` : copy.emptyTitle}</span>
        </div>
      </motion.header>

      <section className="trade-desk-lanes" aria-labelledby="trade-lanes-heading">
        <div className="trade-desk-section-head">
          <div>
            <p className="trade-desk-eyebrow">{copy.choosePath}</p>
          <h2 id="trade-lanes-heading">{copy.question}</h2>
          </div>
          <span className="trade-desk-section-count" aria-hidden>{copy.paths}</span>
        </div>
        <div className="trade-desk-lane-grid">
          {lanes.map((lane, index) => (
            <motion.div
              key={lane.index}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.34, delay: reduced ? 0 : 0.08 + index * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link href={lane.href} className={`trade-desk-lane ${lane.accent ? 'is-accent' : ''}`}>
                <span className="trade-desk-lane-top">
                  <span className="trade-desk-index">{lane.index}</span>
                  <span aria-hidden className="trade-desk-arrow">→</span>
                </span>
                <span>
                  <span className="trade-desk-lane-label">{lane.label}</span>
                  <span className="trade-desk-lane-body">{lane.body}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
        <Link href={routes.agreement} className="trade-desk-agreement">
          <span>{copy.bringAgreement}</span>
          <span className="trade-desk-agreement-body">{copy.bringAgreementBody}</span>
          <span aria-hidden className="trade-desk-agreement-arrow">↗</span>
        </Link>
      </section>

      <section className="trade-desk-work" aria-labelledby="active-agreements-heading">
        <div className="trade-desk-section-head">
          <div>
            <p className="trade-desk-eyebrow">{copy.eyebrow}</p>
            <h2 id="active-agreements-heading">{copy.active}</h2>
          </div>
          <Link href="/activity" className="trade-desk-section-link">{copy.allActivity}&nbsp;→</Link>
        </div>
        <TradeDeskAgreements
          deals={activeDeals}
          fetchState={fetchState}
          viewer={viewer}
          copy={copy}
          translations={translations}
          onRetry={() => void refresh()}
        />
      </section>
    </div>
  );
}

function TradeDeskAgreements({
  deals,
  fetchState,
  viewer,
  copy,
  translations,
  onRetry,
}: {
  deals: ReturnType<typeof useDirectDeals>['deals'];
  fetchState: ReturnType<typeof useDirectDeals>['fetchState'];
  viewer: string;
  copy: (typeof TRADE_ENTRY_COPY)['en']['desk'];
  translations: Messages;
  onRetry: () => void;
}) {
  if (fetchState === 'loading' || fetchState === 'idle') {
    return (
      <div className="trade-desk-agreement-list" aria-label={copy.loading}>
        <div className="trade-desk-skeleton" />
        <div className="trade-desk-skeleton" />
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <div className="trade-desk-empty" role="status">
        <div>
          <p className="trade-desk-empty-title">{translations.dealsFeed.errorBody}</p>
          <p className="trade-desk-empty-body">{copy.emptyBody}</p>
        </div>
        <button type="button" className="trade-desk-retry" onClick={onRetry}>{copy.tryAgain}</button>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="trade-desk-empty">
        <div>
          <p className="trade-desk-empty-title">{copy.emptyTitle}</p>
          <p className="trade-desk-empty-body">{copy.emptyBody}</p>
        </div>
        <Link href="/market" className="trade-desk-retry">{copy.findWork}&nbsp;→</Link>
      </div>
    );
  }

  return (
    <ul className="trade-desk-agreement-list">
      {deals.slice(0, 4).map((deal) => {
        const stage = stageOf(deal);
        const isBuyer = viewer === deal.buyer.toLowerCase();
        const counterparty = isBuyer ? deal.sellerPaytag?.trim() || shortAddress(deal.seller) : shortAddress(deal.buyer);
        const next = labelFor(stage, isBuyer, translations.pending.chips);
        return (
          <li key={deal.jobId}>
            <Link href={`/deals/${deal.jobId}`} className="trade-desk-agreement-row">
              <span className="trade-desk-agreement-main">
                <span className="trade-desk-row-name">{counterparty}</span>
                <span className="trade-desk-row-meta">{translations.dealStage.labels[stage]} · {next?.text ?? translations.dealStage.labels[stage]}</span>
              </span>
              <span className="trade-desk-agreement-value">
                <span>{formatUsdc(deal.dealAmountUsdc, { withSuffix: true })}</span>
                <span aria-hidden className="trade-desk-row-arrow">→</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
