import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { InsightKind } from './insights.js';

/// The sentence for an insight, filled from its numbers (view 52, step 1).
/// A template in five languages; no model writes it. Telegram keeps the bold
/// marks; the assistant and other channels take the plain text.

export interface InsightLineInput {
  kind: InsightKind | string;
  title?: string;
  numbers: Record<string, number>;
}

const fmt = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '' : String(Math.round(n * 100) / 100));

export function insightLine(i: InsightLineInput, locale: UserLocale = 'en'): string | null {
  const n = i.numbers;
  const title = i.title ?? '';
  switch (i.kind) {
    case 'testnet-budget':
      return tg('insight.testnetBudget', locale, { title, low: fmt(n.lowUsdc), high: fmt(n.highUsdc), budget: fmt(n.budgetUsdc), suggested: fmt(n.suggestedUsdc) });
    case 'missed-by-price':
      return tg('insight.missedByPrice', locale, { count: fmt(n.count), lowest: fmt(n.lowestPriceUsdc), median: fmt(n.buyersMedianUsdc) });
    case 'budget-below-band':
      return tg('insight.budgetBelowBand', locale, { title, low: fmt(n.lowUsdc), high: fmt(n.highUsdc), budget: fmt(n.budgetUsdc) });
    case 'cheaper-better-sellers':
      return tg('insight.cheaperBetterSellers', locale, { title, count: fmt(n.count), price: fmt(n.priceUsdc), lowest: fmt(n.lowestUsdc) });
    case 'slow-request':
      return tg('insight.slowRequest', locale, { title, usualDays: fmt(n.usualDays), days: fmt(n.days) });
    default:
      return null;
  }
}

export const plain = (s: string) => s.replace(/\*/g, '');
