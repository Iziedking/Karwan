'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { m } from 'motion/react';
import { Icon } from '@/shared/components/Icon';
import { CARD_CLASS } from '@/shared/components/Card';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { whatItIs } from '@/features/deals/workspace/titleLine';
import { dealReference } from '@/features/deals/dealReference';
import type { DirectDeal } from '@/core/api';
import { Price } from './Price';

/// Money held in deals, one card in the balance column on every screen
/// (owner, 9 Nov 2026, Figma 237:991). A shield lifts and settles so the
/// money waiting in deals is noticed; a tap opens the deals and the total.
export function HeldInDealsCard({ held, deals }: { held: string; deals: { deal: DirectDeal; held: string }[] }) {
  const mp = useTranslations().moneyPage;
  const [open, setOpen] = useState(false);
  const listId = useId();
  const count = deals.length;
  return (
    <div className={`${CARD_CLASS} px-4 sm:px-5`}>
      <button
        type="button"
        data-held-in-deals
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        disabled={count === 0}
        className="flex min-h-[72px] w-full items-center gap-3 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)] disabled:cursor-default"
      >
        <HeldShield />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--ink)]">{mp.heldLabel}</span>
          {count > 0 ? (
            <span className="block text-[13px] text-[var(--ink-secondary)]">{count === 1 ? mp.heldOneDeal : mp.heldDeals.replace('{count}', String(count))}</span>
          ) : null}
        </span>
        <Price usdc={Number(held)} className="shrink-0 text-end text-[17px] font-semibold text-[var(--ink)]" />
        {count > 0 ? (
          <Icon name="chevron-right" size={20} className={`shrink-0 text-[var(--ink-muted)] transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : 'rtl:rotate-180'}`} />
        ) : null}
      </button>
      <div id={listId} hidden={!open} data-held-deals>
        <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {deals.map(({ deal, held: amount }) => (
            <li key={deal.jobId}>
              <Link href={`/deals/${deal.jobId}`} className="flex min-h-16 items-center justify-between gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]">
                <span className="min-w-0">
                  <span dir="auto" className="block truncate text-[15px] font-medium text-[var(--ink)]">{whatItIs(deal) || dealReference(deal.jobId)}</span>
                  <span dir="ltr" className="block text-[13px] tabular-nums text-[var(--ink-secondary)]">{dealReference(deal.jobId)}</span>
                </span>
                <Price usdc={Number(amount)} className="shrink-0 text-end text-[15px] font-medium text-[var(--ink)]" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="flex min-h-12 items-center justify-between gap-3 border-t border-[var(--line)] text-[15px] tabular-nums">
          <span className="text-[var(--ink-secondary)]">{mp.totalHeld}</span>
          <Price usdc={Number(held)} className="text-end font-semibold text-[var(--ink)]" />
        </p>
      </div>
    </div>
  );
}

/// The shield lifts, settles with a small bounce and sends out one soft ring,
/// then rests. Transform and opacity only; still under reduced motion.
function HeldShield() {
  const reduce = useHydratedReducedMotion();
  return (
    <span aria-hidden data-held-shield className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[var(--raised)] text-[var(--action)]">
      {reduce ? null : (
        <m.span
          className="absolute inset-0 rounded-full border-2 border-[var(--action)]"
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1, 1.35], opacity: [0, 0.55, 0] }}
          transition={{ duration: 0.95, times: [0, 0.05, 1], ease: 'easeOut', repeat: Infinity, repeatDelay: 1.4 }}
        />
      )}
      <m.span
        className="relative grid place-items-center"
        animate={reduce ? undefined : { y: [0, -5, 1.5, -1, 0] }}
        transition={reduce ? undefined : { duration: 0.95, times: [0, 0.35, 0.62, 0.82, 1], ease: 'easeOut', repeat: Infinity, repeatDelay: 1.4 }}
      >
        <Icon name="shield-check" size={24} />
      </m.span>
    </span>
  );
}
