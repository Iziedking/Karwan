'use client';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { formatBalance } from '../balanceModel';
import { formatLocal } from '../displayCurrency';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';

/// Every price on Karwan reads the same way (owner, 5 Nov 2026): the currency
/// the person chose in Settings leads, and the USDC it really is sits under it.
/// Money always stays in USDC; with USDC chosen, or no fresh rate, USDC leads alone.
///
///   hero    the big figure at the top of a page
///   stack   a price on a card or a row: the figure, USDC under it
///   inline  a price inside a line of text: "₦26,885 · 20.00 USDC"
export function Price({
  usdc,
  size = 'stack',
  signed = false,
  className,
  usdcClassName,
  figureClassName,
}: {
  usdc: number;
  size?: 'hero' | 'stack' | 'inline';
  signed?: boolean;
  className?: string;
  usdcClassName?: string;
  /// The hero figure's own size, for a page whose hero is bigger.
  figureClassName?: string;
}) {
  const { locale } = useLocale();
  const { currency, rate } = useDisplayCurrency();
  const numberLocale = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const sign = signed && usdc > 0 ? '+' : signed && usdc < 0 ? '−' : '';
  const usdcText = `${sign}${formatBalance(Math.abs(usdc), numberLocale)} USDC`;
  const local = formatLocal(usdc, currency, rate, locale, signed);

  if (size === 'inline') {
    return (
      <span data-price dir="ltr" className={cn('tabular-nums', className)}>
        {local ? <>{local}<span className={cn('text-[var(--ink-secondary)]', usdcClassName)}> · {usdcText}</span></> : usdcText}
      </span>
    );
  }

  if (size === 'hero') {
    return (
      <span data-price className={cn('block', className)}>
        <span dir="ltr" className="flex items-baseline gap-2 tabular-nums">
          <span className={figureClassName ?? 'text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--ink)] sm:text-[40px]'}>
            {local ?? `${sign}${formatBalance(Math.abs(usdc), numberLocale)}`}
          </span>
          {local ? null : <span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span>}
        </span>
        {local ? <span data-price-usdc dir="ltr" className={cn('mt-0.5 block text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]', usdcClassName)}>{usdcText}</span> : null}
      </span>
    );
  }

  return (
    <span data-price dir="ltr" className={cn('inline-flex flex-col tabular-nums', className)}>
      <span>{local ?? usdcText}</span>
      {local ? <span data-price-usdc className={cn('text-[13px] font-medium text-[var(--ink-secondary)]', usdcClassName)}>{usdcText}</span> : null}
    </span>
  );
}

/// A sentence with a price in it, such as "Up to {amount}": the price reads
/// the same way as everywhere else.
export function PriceIn({ template, usdc, className }: { template: string; usdc: number; className?: string }) {
  const [before, after = ''] = template.split('{amount}');
  return <span className={className}>{before}<Price usdc={usdc} size="inline" />{after}</span>;
}
