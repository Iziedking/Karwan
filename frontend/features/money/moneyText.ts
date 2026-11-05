import { formatAmount, formatBalance } from './balanceModel';
import { formatLocal, type DisplayCurrency } from './displayCurrency';

/// A price as plain text, for buttons, small print and sentences (view 54):
/// one figure in the chosen currency, "₦26,922". With USDC chosen, or no
/// fresh rate, "20.00 USDC". Only a page's block balance shows both.
///
///   default  to the cent, "20.00", as balances read
///   exact    every decimal a movement has, "0.125"
///   compact  as prices on offers read, "96" or "96.5"
export type MoneyTextOptions = { exact?: boolean; compact?: boolean; signed?: boolean };

const COMPACT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/// The USDC figure alone, "20.00", in the screen's own style.
export function usdcFigure(usdc: number, locale: string, options: MoneyTextOptions = {}): string {
  const numberLocale = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const value = Math.abs(usdc);
  return options.compact ? COMPACT.format(value) : options.exact ? formatAmount(value, numberLocale) : formatBalance(value, numberLocale);
}

export function moneyText(
  usdc: number,
  currency: DisplayCurrency,
  rate: number | null,
  locale: string,
  options: MoneyTextOptions = {},
): string {
  const local = formatLocal(usdc, currency, rate, locale, options.signed);
  if (local) return local;
  const sign = options.signed && usdc > 0 ? '+' : options.signed && usdc < 0 ? '−' : '';
  return `${sign}${usdcFigure(usdc, locale, options)} USDC`;
}

/// Fills a sentence such as "Add {amount} USDC": a money value takes the
/// placeholder and the "USDC" after it, so the sentence reads "Add ₦26,922". Swahili puts USDC first ("Tuma USDC {amount}"),
/// and that USDC is taken too. Other values fill as plain text.
export function fillMoney(
  template: string,
  money: Record<string, number | null | undefined>,
  currency: DisplayCurrency,
  rate: number | null,
  locale: string,
  vars: Record<string, string | number> = {},
  options: MoneyTextOptions = {},
): string {
  return template.replace(
    /(USDC[   ]?)?\{(\w+)\}([   ]?USDC)?/g,
    (whole, lead: string | undefined, key: string, trail: string | undefined) => {
      const value = money[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        // "{spent} of {limit}" names no USDC: with USDC chosen it stays a bare figure.
        if (!lead && !trail && !formatLocal(value, currency, rate, locale)) return usdcFigure(value, locale, options);
        return moneyText(value, currency, rate, locale, options);
      }
      if (key in vars) return `${lead ?? ''}${String(vars[key])}${trail ?? ''}`;
      return whole;
    },
  );
}

/// "≈ ₦26,922" under an amount being typed in USDC, or null.
export function localHint(usdc: number, currency: DisplayCurrency, rate: number | null, locale: string): string | null {
  const local = formatLocal(usdc, currency, rate, locale);
  return local ? `≈ ${local}` : null;
}

const USDC_FIGURE = /USDC[  ]?([+\-−]?\d[\d,]*(?:\.\d+)?)|([+\-−]?\d[\d,]*(?:\.\d+)?)[  ]?USDC/g;

/// A sentence written at record time, "Received 500 USDC from @ada", with each
/// figure said in the chosen currency: "Received ₦673,055 from @ada". Swahili's
/// "USDC 500" is taken too. With USDC chosen the figure keeps its USDC.
export function localiseFigures(text: string, format: (usdc: number) => string): string {
  return text.replace(USDC_FIGURE, (whole, lead: string | undefined, trail: string | undefined) => {
    const n = Number((lead ?? trail ?? '').replace(/,/g, '').replace(/−/, '-'));
    return Number.isFinite(n) ? format(n) : whole;
  });
}
