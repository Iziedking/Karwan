'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '../tradeEntry';

type TradeDeskProps = { business?: boolean };

/**
 * Trade is the full intent-entry surface. Home keeps the compact quick-entry
 * cards; this page gives the same decision room as the user's preferred
 * reference design and keeps the next action obvious.
 */
export function TradeDesk({ business = false }: TradeDeskProps) {
  const { locale } = useLocale();
  const reduced = useReducedMotion();
  const entryCopy = TRADE_ENTRY_COPY[locale];
  const copy = entryCopy.desk;
  const routes = tradeEntryRoutes(business);
  const actions = [
    {
      id: 'sell',
      href: routes.sell,
      title: copy.findClients,
      body: copy.findClientsBody,
    },
    {
      id: 'buy',
      href: routes.buy,
      title: copy.findWork,
      body: copy.findWorkBody,
    },
  ];

  return (
    <div className="trade-intent mx-auto w-full max-w-[1040px]" data-ui="trade-intent">
      <motion.header
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="trade-intent-header"
      >
        <h1 id="trade-desk-heading" className="trade-intent-title">{copy.title}</h1>
        <p className="trade-intent-intro">{entryCopy.body}</p>
      </motion.header>

      <section aria-labelledby="trade-intent-actions-heading" className="trade-intent-actions">
        <h2 id="trade-intent-actions-heading" className="sr-only">{copy.question}</h2>
        <div role="list">
          {actions.map((action, index) => (
            <motion.div
              key={action.id}
              role="listitem"
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.34, delay: reduced ? 0 : 0.1 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link href={action.href} className="trade-intent-action group">
                <span className="trade-intent-action-copy">
                  <span className="trade-intent-action-title">{action.title}</span>
                  <span className="trade-intent-action-body">{action.body}</span>
                </span>
                <span aria-hidden className="trade-intent-action-arrow">→</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="trade-intent-agreement-wrap">
        <Link href={routes.agreement} className="trade-intent-agreement group">
          <span>{entryCopy.agreement}</span>
          <span aria-hidden className="trade-intent-agreement-arrow">→</span>
        </Link>
        <p className="trade-intent-scope">{entryCopy.scope}</p>
      </div>
    </div>
  );
}
