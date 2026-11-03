'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/shared/components/Icon';
import { Button } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { PlainOption } from '../plainSteps';

/// One plain question, then one card with a row per way that works for this
/// account (view 19, Money board; Figma, Batch 9 · Add money). A row opens a
/// page, or tells the page which panel to show; a coming one says so and has
/// nothing to press.
export function PlainChooser<Id extends string>({ question, options, words, onPick }: {
  question: string;
  options: PlainOption<Id>[];
  words: (id: Id) => { label: string };
  onPick: (option: PlainOption<Id>) => void;
}) {
  const t = useTranslations().plainMoney;
  const row = 'flex min-h-[52px] w-full items-center gap-3 py-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]';
  return (
    <section aria-labelledby="plain-question">
      <h2 id="plain-question" className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--ink)]">{question}</h2>
      <ul className={`${CARD_CLASS} mt-5 divide-y divide-[var(--line)] px-5`}>
        {options.map((o) => {
          const label = words(o.id).label;
          if (o.soon) {
            return (
              <li key={o.id} className={row}>
                <span className="min-w-0 flex-1 text-[15px] font-medium text-[var(--ink-muted)]">{label}</span>
                <span className="shrink-0 text-[14px] text-[var(--ink-muted)]">{t.soon}</span>
              </li>
            );
          }
          const inner = (
            <>
              <span className="min-w-0 flex-1 text-[15px] font-medium text-[var(--ink)]">{label}</span>
              <Icon name="chevron-right" size={20} directional className="shrink-0 text-[var(--ink-secondary)]" />
            </>
          );
          return (
            <li key={o.id}>
              {o.opens && 'href' in o.opens ? (
                <Link href={o.opens.href} className={row}>{inner}</Link>
              ) : (
                <button type="button" onClick={() => onPick(o)} className={row}>{inner}</button>
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
    <section aria-labelledby="exchange-title">
      <h2 id="exchange-title" className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--ink)]">{t.exchangeTitle}</h2>
      <p className="mt-2 text-[15px] text-[var(--ink-secondary)]">{t.exchangeBody}</p>
      <div className={`${CARD_CLASS} mt-5 p-5`}>
        <span dir="ltr" className="block break-all text-[17px] font-medium tabular-nums text-[var(--ink)]">{address}</span>
      </div>
      <Button
        type="button"
        size="lg"
        className="mt-6 w-full"
        onClick={() => {
          void navigator.clipboard?.writeText(address).then(() => setCopied(true)).catch(() => {});
        }}
      >
        {copied ? t.copied : t.copy}
      </Button>
    </section>
  );
}
