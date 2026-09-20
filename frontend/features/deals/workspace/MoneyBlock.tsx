'use client';
import type { DealView } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { actionLabel, actorLabel, automaticLine, formatUsdcAmount } from './presentation';

const LINE_KEY = {
  'not-funded': 'notFunded', held: 'held', sending: 'sending', paused: 'paused',
  released: 'released', refunding: 'refunding', refunded: 'refunded',
} as const;

const LINE_TONE: Record<DealView['money']['line'], string> = {
  'not-funded': 'var(--lp-text-sub)',
  held: 'var(--color-positive)',
  sending: 'var(--lp-text-sub)',
  paused: 'var(--color-warning)',
  released: 'var(--color-positive)',
  refunding: 'var(--lp-text-sub)',
  refunded: 'var(--lp-text-sub)',
};

export function MoneyBlock({ amountUsdc, view, counterpartyName, onAction, busy }: {
  amountUsdc: string;
  view: DealView;
  counterpartyName: string;
  onAction: () => void;
  busy: boolean;
}) {
  const copy = useTranslations().dealWorkspace;
  const { locale } = useLocale();
  const label = actionLabel(view.next, copy, locale);
  const automatic = automaticLine(view, copy, locale);
  return (
    <section aria-labelledby="deal-amount" className="space-y-4">
      <h1 id="deal-amount" className="flex items-baseline gap-2 tabular-nums">
        <span className="text-[44px] font-semibold leading-none tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[56px]">
          {formatUsdcAmount(amountUsdc, locale)}
        </span>
        <span className="text-[18px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
      </h1>
      <p role="status" aria-live="polite" className="flex items-start gap-2 text-[15px] leading-relaxed text-[var(--lp-dark)]">
        <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: LINE_TONE[view.money.line] }} />
        {copy.money[LINE_KEY[view.money.line]]}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {label ? (
          <button
            type="button"
            onClick={onAction}
            disabled={busy}
            className="inline-flex min-h-12 items-center rounded-[10px] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors duration-200 hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            {busy ? copy.confirm.working : label}
          </button>
        ) : null}
        <span className="text-[13px] font-medium text-[var(--lp-text-sub)]">{actorLabel(view.next, counterpartyName, copy)}</span>
      </div>
      {automatic ? <p className="text-[13px] text-[var(--lp-text-sub)]">{automatic}</p> : null}
    </section>
  );
}
