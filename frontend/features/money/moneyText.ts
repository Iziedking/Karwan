import { formatAmount, formatBalance } from './balanceModel';
import { formatLocal, type DisplayCurrency } from './displayCurrency';

/// A price as plain text, for buttons, small print and sentences (owner,
/// 5 Nov 2026): the chosen currency leads and the USDC it really is follows,
/// "₦26,922 · 20.00 USDC". With USDC chosen, or no fresh rate, "20.00 USDC".
export type MoneyTextOptions = { exact?: boolean; signed?: boolean };

const ISOLATE_START = '⁦';
const ISOLATE_END = '⁩';

export function moneyText(
  usdc: number,
  currency: DisplayCurrency,
  rate: number | null,
  locale: string,
  options: MoneyTextOptions = {},
): string {
  const numberLocale = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const sign = options.signed && usdc > 0 ? '+' : options.signed && usdc < 0 ? '−' : '';
  const figure = options.exact ? formatAmount(Math.abs(usdc), numberLocale) : formatBalance(Math.abs(usdc), numberLocale);
  const usdcPart = `${sign}${figure} USDC`;
  const local = formatLocal(usdc, currency, rate, locale, options.signed);
  const text = local ? `${local} · ${usdcPart}` : usdcPart;
  return locale === 'ar' ? `${ISOLATE_START}${text}${ISOLATE_END}` : text;
}

/// Fills a sentence such as "Add {amount} USDC": a money value takes the
/// placeholder and the "USDC" after it, so the sentence reads
/// "Add ₦26,922 · 20.00 USDC". Swahili puts USDC first ("Tuma USDC {amount}"),
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
      if (typeof value === 'number' && Number.isFinite(value)) return moneyText(value, currency, rate, locale, options);
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
