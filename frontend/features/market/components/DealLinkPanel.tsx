'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Sheet } from '@/features/deals/workspace/Sheet';
import { sellerDealLink } from '@/features/deals/dealLink';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from '@/features/home/tradeEntry';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { PRIMARY, SECONDARY } from '@/shared/ui/controls';
import { Chevron } from './YourTrades';

/// A deal you already agreed: paying opens the deal form; getting paid gives
/// the link to send, since on the web only the buyer starts a protected deal
/// (view 38). `start` skips the question when Home already knows the answer.
export function DealLinkPanel({ start = 'ask' }: { start?: 'ask' | 'link' }) {
  const { locale } = useLocale();
  const copy = TRADE_ENTRY_COPY[locale].link;
  const [view, setView] = useState(start);

  if (view === 'ask') {
    const choices = [
      { key: 'paying', title: copy.paying, body: copy.payingBody, href: tradeEntryRoutes().agreement },
      { key: 'paid', title: copy.gettingPaid, body: copy.gettingPaidBody, href: null },
    ];
    return (
      <div>
        <p id="deal-link-question" className="text-[17px] font-semibold text-[var(--lp-dark)]">{copy.question}</p>
        <ul aria-labelledby="deal-link-question" className="mt-3 overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
          {choices.map((c) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-[var(--lp-dark)]">{c.title}</span>
                  <span className="mt-0.5 block text-[15px] font-medium text-[var(--lp-text-sub)]">{c.body}</span>
                </span>
                <Chevron />
              </>
            );
            const row = 'flex min-h-[72px] w-full items-center gap-4 px-4 py-3 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:px-5';
            return (
              <li key={c.key} className="border-b border-[var(--lp-border-light)] last:border-b-0">
                {c.href ? <Link href={c.href} className={row}>{inner}</Link> : <button type="button" onClick={() => setView('link')} className={row}>{inner}</button>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  return <LinkToSend />;
}

function LinkToSend() {
  const { locale } = useLocale();
  const copy = TRADE_ENTRY_COPY[locale].link;
  const { profile } = useUserProfile();
  const [copied, setCopied] = useState(false);
  const tag = profile?.handle;
  if (!tag) {
    return (
      <Link href="/profile/edit" className="text-[15px] font-medium text-[var(--lp-dark)] underline underline-offset-4">{copy.noTag}</Link>
    );
  }
  const link = sellerDealLink(window.location.origin, tag);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <p className="text-[17px] font-semibold text-[var(--lp-dark)]">{copy.title}</p>
      <p className="mt-3 break-all rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] px-4 py-3 text-[15px] font-medium text-[var(--lp-dark)]">{link}</p>
      <p className="mt-3 text-[15px] font-medium text-[var(--lp-text-sub)]">{copy.note}</p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <button type="button" onClick={() => void copyLink()} className={PRIMARY}>{copied ? copy.copied : copy.copy}</button>
        {canShare ? <button type="button" onClick={() => void navigator.share({ url: link, text: copy.note }).catch(() => {})} className={SECONDARY}>{copy.share}</button> : null}
      </div>
      <Link href="/request" className="mt-4 inline-flex min-h-11 items-center text-[15px] font-medium text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)]">{copy.requestInstead}</Link>
    </div>
  );
}

/// The same, on its own, for Home's Send a deal link.
export function DealLinkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useLocale();
  return (
    <Sheet open={open} title={TRADE_ENTRY_COPY[locale].link.title} onClose={onClose}>
      <DealLinkPanel start="link" />
    </Sheet>
  );
}
