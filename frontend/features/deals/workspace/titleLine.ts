import type { DirectDeal } from '@/core/api';
import type { DealPageCopy } from '@/shared/i18n/messages/dealPage';
import { moneySplit } from './dealSteps';
import { fill, formatUsdcAmount } from './presentation';

/// The money line of a deal paid in stages once part of it is out (rule 1):
/// "60 USDC paid to Ada · 60 USDC held by Karwan". Null otherwise, and the
/// page says where the money is in one word.
export function titleMoneyLine(deal: DirectDeal, name: string, t: DealPageCopy, locale: string): string | null {
  const split = moneySplit(deal);
  if (!split || split.paidOutUsdc === '0' || split.heldUsdc === '0') return null;
  return fill(t.split, { paid: formatUsdcAmount(split.paidOutUsdc, locale), held: formatUsdcAmount(split.heldUsdc, locale), name });
}

/// What the deal is for: the first line of its terms.
export function whatItIs(deal: DirectDeal): string | null {
  const first = deal.terms.split('\n').map((line) => line.trim()).find(Boolean);
  return first ?? null;
}
