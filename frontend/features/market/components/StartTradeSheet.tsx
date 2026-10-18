'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sheet } from '@/features/deals/workspace/Sheet';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '@/features/home/tradeEntry';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { Chevron } from './YourTrades';

/// Start a trade: the three ways in, one sheet, the same for every account.
/// A bottom sheet on a phone, a side panel on a wider screen.
export function StartTradeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useLocale();
  const entryCopy = TRADE_ENTRY_COPY[locale];
  const copy = entryCopy.desk;
  const routes = tradeEntryRoutes();
  const paths = [
    { href: routes.buy, title: copy.need, body: copy.needBody, icon: <SearchIcon /> },
    { href: routes.sell, title: copy.sell, body: copy.sellBody, icon: <TagIcon /> },
    { href: routes.agreement, title: entryCopy.agreement, body: copy.bringAgreementBody, icon: <AgreementIcon /> },
  ];
  return (
    <Sheet open={open} title={entryCopy.title} onClose={onClose}>
      <ul className="overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]" aria-label={copy.question}>
        {paths.map((path) => (
          <li key={path.href} className="border-b border-[var(--lp-border-light)] last:border-b-0">
            <Link href={path.href} className="group flex min-h-[76px] items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--lp-light)] text-[var(--lp-dark)]">{path.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold text-[var(--lp-dark)]">{path.title}</span>
                <span className="mt-0.5 block text-[15px] font-medium text-[var(--lp-text-sub)]">{path.body}</span>
              </span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function SearchIcon() {
  return <Icon><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Icon>;
}

function TagIcon() {
  return <Icon><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.2 7.2a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.2-7.2a1 1 0 0 1-.3-.7z" /><circle cx="8" cy="8" r="1.4" /></Icon>;
}

function AgreementIcon() {
  return <Icon><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3.5V8h4.5" /><path d="m9 14 2 2 4-4" /></Icon>;
}
