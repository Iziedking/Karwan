'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import type { PlainOption } from '../plainSteps';

const CARD =
  'flex w-full items-center gap-4 rounded-[18px] border p-4 text-start transition-[transform,border-color,background-color] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';

/// One plain question with a card per way that works for this account (view
/// 19, Money board). A card opens a page, or tells the page which panel to
/// show; a coming one says so and has nothing to press.
export function PlainChooser<Id extends string>({ question, options, words, icons, onPick }: {
  question: string;
  options: PlainOption<Id>[];
  words: (id: Id) => { label: string; note: string };
  icons: Record<Id, IconName>;
  onPick: (option: PlainOption<Id>) => void;
}) {
  const t = useTranslations().plainMoney;
  return (
    <section aria-labelledby="plain-question">
      <h2 id="plain-question" className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{question}</h2>
      <ul className="mt-4 flex flex-col gap-2.5">
        {options.map((o, i) => {
          const w = words(o.id);
          const inner = (
            <>
              <span aria-hidden className={cn('grid size-11 shrink-0 place-items-center rounded-[12px]', i === 0 && !o.soon ? 'bg-[var(--lp-accent)] text-[var(--accent-ink)]' : 'bg-[var(--lp-light)] text-[var(--lp-dark)]')}>
                <Icon name={icons[o.id]} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[16px] font-semibold', o.soon ? 'text-[var(--lp-text-sub)]' : 'text-[var(--lp-dark)]')}>{w.label}</span>
                <span className="mt-0.5 block text-[14px] font-medium leading-snug text-[var(--lp-text-sub)]">{w.note}</span>
              </span>
              {o.soon ? <span className="shrink-0 rounded-full bg-[var(--lp-light)] px-2.5 py-1 text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.soon}</span> : null}
            </>
          );
          if (o.soon) {
            return <li key={o.id} className={cn(CARD, 'border-dashed border-[var(--lp-border-light)]')}>{inner}</li>;
          }
          const live = cn(CARD, 'border-[var(--lp-border-light)] bg-[var(--lp-card)] hover:-translate-y-0.5 hover:border-[var(--lp-outline-strong)] motion-reduce:hover:translate-y-0');
          return (
            <li key={o.id}>
              {o.opens && 'href' in o.opens ? (
                <Link href={o.opens.href} className={live}>{inner}</Link>
              ) : (
                <button type="button" onClick={() => onPick(o)} className={live}>{inner}</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/// Where to send USDC from an exchange: the wallet's own address on Arc.
export function ExchangePanel({ address }: { address: string }) {
  const t = useTranslations().plainMoney;
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="exchange-title" className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <h2 id="exchange-title" className="text-[18px] font-semibold text-[var(--lp-dark)]">{t.exchangeTitle}</h2>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{t.exchangeBody}</p>
      <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-[var(--lp-outline-strong)] bg-[var(--lp-light)] py-2 pe-2 ps-3.5">
        <span className="min-w-0 flex-1 break-all text-[15px] font-medium tabular-nums text-[var(--lp-dark)]">{address}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(address).then(() => setCopied(true)).catch(() => {});
          }}
          className="min-h-11 shrink-0 rounded-[10px] bg-[var(--lp-accent)] px-4 text-[14px] font-semibold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]"
        >
          {copied ? t.copied : t.copy}
        </button>
      </div>
    </section>
  );
}
