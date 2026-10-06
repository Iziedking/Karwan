'use client';
import { useState } from 'react';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatAmount } from '@/features/money/balanceModel';
import { cn } from '@/shared/utils/cn';
import { fill } from '@/features/deals/workspace/presentation';
import type { SourceRow } from './sourceRows';

/// "Pay from" as rows like the wallet's balance card: Arc first with its
/// balance, the chains holding USDC under it, the rest folded behind Show.
export function SourcePicker<K extends ChainKey>({ listed, empty, selected, onSelect, nameOf, connected }: {
  listed: SourceRow<K>[];
  empty: SourceRow<K>[];
  selected: 'arc' | K;
  onSelect: (key: 'arc' | K) => void;
  nameOf: (key: 'arc' | K) => string;
  connected: boolean;
}) {
  const copy = useTranslations().payLink.pay;
  const [open, setOpen] = useState(false);
  const row = (r: SourceRow<K>, muted = false) => (
    <li key={r.key} className="border-t border-[var(--lp-border-light)] first:border-t-0">
      <button
        type="button"
        role="radio"
        aria-checked={selected === r.key}
        onClick={() => onSelect(r.key)}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 px-4 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]',
          selected === r.key ? 'bg-[var(--lp-light)]' : 'hover:bg-[var(--lp-light)]',
        )}
      >
        <ChainLogo chain={r.key === 'arc' ? 'arc' : r.key} size={muted ? 24 : 30} />
        <span className={cn('min-w-0 flex-1 truncate text-[15px] font-semibold', muted ? 'text-[var(--lp-text-sub)]' : 'text-[var(--lp-dark)]')}>{nameOf(r.key)}</span>
        {r.amount !== null ? <Amount value={r.amount} muted={muted} /> : null}
        <span
          aria-hidden
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full border',
            selected === r.key ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)]' : 'border-[var(--lp-border-light)]',
          )}
        >
          {selected === r.key ? <span className="size-2 rounded-full bg-[#10170b]" /> : null}
        </span>
      </button>
    </li>
  );
  return (
    <div role="radiogroup" aria-label={copy.payFrom} className="mt-2 overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
      <ul>
        {listed.map((r) => row(r))}
        {empty.length > 0 ? (
          <li className="border-t border-[var(--lp-border-light)] first:border-t-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="flex shrink-0 -space-x-2 rtl:space-x-reverse" aria-hidden>
                {empty.slice(0, 4).map((r) => (
                  <span key={r.key} className="rounded-full ring-2 ring-[var(--lp-card)]">
                    <ChainLogo chain={r.key === 'arc' ? 'arc' : r.key} size={22} />
                  </span>
                ))}
              </span>
              <span className="min-w-0 flex-1 text-[14px] font-medium text-[var(--lp-text-sub)]">
                {fill(connected ? copy.noUsdcOther : copy.otherChains, { n: empty.length })}
              </span>
              <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{open ? copy.hide : copy.show}</span>
            </button>
            {open ? <ul className="border-t border-[var(--lp-border-light)]">{empty.map((r) => row(r, true))}</ul> : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Amount({ value, muted }: { value: number; muted: boolean }) {
  const { locale } = useLocale();
  return (
    <span className={cn('shrink-0 text-end font-semibold tabular-nums', muted ? 'text-[14px] text-[var(--lp-text-sub)]' : 'text-[17px] text-[var(--lp-dark)]')}>
      {formatAmount(value, locale)}
      <span className="ms-1 text-[13px] font-medium text-[var(--lp-text-sub)]">USDC</span>
    </span>
  );
}
