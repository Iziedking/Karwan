import type { LocalAmount } from '@/core/api';
import { formatBalance } from '@/features/money/balanceModel';
import { formatLocal, isDisplayCurrency, type DisplayCurrency } from '@/features/money/displayCurrency';

/// The currencies a teammate can read the desk in (view 79), in the order the
/// picker lists them.
export const DESK_CURRENCIES = ['USDC', 'NGN', 'KES', 'XOF', 'USD', 'EUR', 'GBP', 'AED', 'INR', 'CNY'] as const satisfies readonly DisplayCurrency[];

export type DeskRates = Partial<Record<string, number>>;

export interface DeskAmount {
  main: string;
  under: string | null;
  forThem: string | null;
}

const WHOLE = new Set(['NGN', 'KES', 'XOF']);

export function readDeskCurrency(raw: string | null): DisplayCurrency {
  return isDisplayCurrency(raw) ? raw : 'NGN';
}

/// One USDC amount as the desk shows it: the chosen currency first (a figure
/// kept when the money moved wins), exact USDC under it, and the person's own
/// currency when it differs. No rate means USDC with a note, never a guess.
export function deskMoney(usdc: string, currency: DisplayCurrency, rates: DeskRates, opts: { kept?: LocalAmount; theirs?: string } = {}): DeskAmount {
  const value = Number(usdc);
  const exact = `${formatBalance(value, 'en')} USDC`;
  const forThem = theirLine(value, currency, rates, opts.theirs);
  if (currency === 'USDC') return { main: exact, under: null, forThem };
  if (opts.kept && opts.kept.currency === currency) {
    const kept = formatLocal(Number(opts.kept.amount), currency, 1, 'en');
    if (kept) return { main: kept, under: exact, forThem };
  }
  const local = formatLocal(value, currency, rates[currency] ?? null, 'en');
  if (!local) return { main: exact, under: `No rate for ${currency} right now`, forThem };
  return { main: local, under: exact, forThem };
}

function theirLine(value: number, currency: DisplayCurrency, rates: DeskRates, theirs?: string): string | null {
  if (!theirs || theirs === currency || theirs === 'USDC') return null;
  const rate = rates[theirs];
  if (!rate) return null;
  const digits = WHOLE.has(theirs) ? 0 : 2;
  const figure = new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value * rate);
  return `${theirs} ${figure} for them`;
}
