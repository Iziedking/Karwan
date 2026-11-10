'use client';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { usdcFigure } from '../moneyText';
import { formatLocal } from '../displayCurrency';
import { formatTyped } from '../localAmount';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { aboutUsdFigure } from '../visitorCurrency';
import { marketShopCopy } from '@/shared/i18n/messages/marketShop';

/// Every price on Karwan reads in the currency the person chose (view 54):
/// one figure, "₦26,885". Only a page's one block balance also shows the USDC
/// it really is, under it. With USDC chosen, or no fresh rate, USDC alone.
///
///   block   the page's one balance: the figure, USDC under it
///   hero    any other big figure at the top of a page
///   stack   a price on a card or a row
///   inline  a price inside a line of text
export function Price({
  usdc,
  size = 'stack',
  signed = false,
  className,
  usdcClassName,
  figureClassName,
  compact = false,
  agreed,
}: {
  usdc: number;
  size?: 'block' | 'hero' | 'stack' | 'inline';
  signed?: boolean;
  className?: string;
  usdcClassName?: string;
  /// The big figure's own size, for a page whose figure is bigger.
  figureClassName?: string;
  /// Offers read their USDC without forced cents: "96 USDC".
  compact?: boolean;
  /// A price agreed in a local currency (view 55): read back as agreed when
  /// the reader is in that currency.
  agreed?: { currency: string; amount: string } | null;
}) {
  const { locale } = useLocale();
  const { currency, rate, visitor } = useDisplayCurrency();
  const sign = signed && usdc > 0 ? '+' : signed && usdc < 0 ? '−' : '';
  const figure = usdcFigure(usdc, locale, { compact });
  const usdcText = `${sign}${figure} USDC`;
  const local = agreed && agreed.currency === currency && rate ? formatTyped(agreed.amount, currency, locale) : formatLocal(usdc, currency, rate, locale, signed);

  if (size === 'block' || size === 'hero') {
    return (
      <span data-price className={cn('block', className)}>
        <span dir="ltr" className="flex items-baseline gap-2 tabular-nums">
          <span className={figureClassName ?? 'text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ink)] sm:text-[40px]'}>
            {local ?? `${sign}${figure}`}
          </span>
          {local ? null : <span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span>}
        </span>
        {local && size === 'block' ? <span data-price-usdc dir="ltr" className={cn('mt-0.5 block text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]', usdcClassName)}>{usdcText}</span> : null}
      </span>
    );
  }

  // Before sign-in a card's price reads in local money with the dollar figure
  // small beside it (view 74).
  const dollars = local && size === 'stack' ? aboutUsdFigure(usdc, currency, visitor) : null;
  return (
    <span data-price dir="ltr" className={cn('tabular-nums', size === 'stack' && 'inline-flex', dollars && 'flex-wrap items-baseline gap-x-2', className)}>
      {local ?? usdcText}
      {dollars ? (
        <span data-price-usd dir="auto" className="text-[13px] font-normal text-[var(--ink-secondary)]">
          {marketShopCopy[locale].aboutUsd.replace('{amount}', dollars)}
        </span>
      ) : null}
    </span>
  );
}

/// A sentence with a price in it, such as "Up to {amount}": the price reads
/// the same way as everywhere else.
/// A range in a sentence, each amount in the person's money (view 73).
export function PriceRange({ template, low, high, className }: { template: string; low: number; high: number; className?: string }) {
  const [before, rest = ''] = template.split('{low}');
  const [middle, after = ''] = rest.split('{high}');
  return <span className={className}>{before}<Price usdc={low} size="inline" />{middle}<Price usdc={high} size="inline" />{after}</span>;
}

export function PriceIn({ template, usdc, className, agreed }: { template: string; usdc: number; className?: string; agreed?: { currency: string; amount: string } | null }) {
  const [before, after = ''] = template.split('{amount}');
  return <span className={className}>{before}<Price usdc={usdc} size="inline" agreed={agreed} />{after}</span>;
}
