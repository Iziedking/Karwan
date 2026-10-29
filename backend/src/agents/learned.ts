import type { AgentWays, SellWay, WayShape } from './ways.js';
import { fittingWay } from './ways.js';

/// What the agent learns from the person's own history (view 41): a kind of
/// deal they keep accepting by question, the prices they agree, the questions
/// they always say no to under a level. Each is a suggestion the person
/// confirms through the same cards that set things up; nothing here writes a
/// setting, and the model never does. Pure: the caller supplies the history.

export const THRESHOLD_DEALS = 3;
export const THRESHOLD_NOS = 3;
/// A usual price is suggested only when the agreed prices sit this far from the saved one.
export const USUAL_DRIFT = 0.1;

export interface AnsweredQuestion {
  kind: string;
  choice: 'yes' | 'change' | 'no';
  budgetUsdc: number | null;
  /// The price the person answered with, when they did.
  priceUsdc: number | null;
  tradeType: 'service' | 'goods' | 'mixed' | null;
  title: string;
}

export interface SettledDeal {
  priceUsdc: number;
  tradeType: 'service' | 'goods' | 'mixed' | null;
}

export interface LearnedInputs {
  ways: Pick<AgentWays, 'sell'>;
  noAskBelowUsdc: number | null;
  dismissed: readonly string[];
  /// Newest first.
  answered: readonly AnsweredQuestion[];
  /// Newest first, the seller's own settled deals.
  settled: readonly SettledDeal[];
}

export type Suggestion =
  | { key: string; kind: 'new-way'; shape: WayShape; what: string; priceUsdc: number; line: string }
  | { key: string; kind: 'usual-price'; shape: WayShape; priceUsdc: number; deals: number; line: string }
  | { key: string; kind: 'no-ask-below'; priceUsdc: number; line: string };

const shapeFor = (tradeType: AnsweredQuestion['tradeType']): WayShape => (tradeType === 'goods' || tradeType === 'mixed' ? 'goods' : 'one_time');
const money = (n: number) => Number(n.toFixed(2));

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/// A yes to "you have not told your agent how you sell this": the way to save.
export function suggestedWays(i: Pick<LearnedInputs, 'ways' | 'answered'>): Suggestion[] {
  const out: Suggestion[] = [];
  const have = new Set(i.ways.sell.map((w) => w.shape));
  for (const q of i.answered) {
    if (q.kind !== 'no-way' || q.choice === 'no') continue;
    const shape = shapeFor(q.tradeType);
    if (have.has(shape) || out.some((s) => s.kind === 'new-way' && s.shape === shape)) continue;
    const price = q.priceUsdc ?? q.budgetUsdc;
    if (!price || price <= 0) continue;
    const what = q.title.trim() || (shape === 'goods' ? 'these goods' : 'this work');
    out.push({ key: `way:${shape}`, kind: 'new-way', shape, what, priceUsdc: money(price), line: `Save this as how you sell ${what}?` });
  }
  return out;
}

/// Three agreed deals at prices away from the saved usual: a new usual price.
export function suggestedUsualPrice(i: Pick<LearnedInputs, 'ways' | 'settled'>): Suggestion[] {
  const out: Suggestion[] = [];
  const groups = new Map<WayShape, number[]>();
  for (const d of i.settled) {
    if (!(d.priceUsdc > 0)) continue;
    const shape = shapeFor(d.tradeType);
    groups.set(shape, [...(groups.get(shape) ?? []), d.priceUsdc]);
  }
  for (const [shape, prices] of groups) {
    if (prices.length < THRESHOLD_DEALS) continue;
    const way: SellWay | null = fittingWay(i.ways.sell, shape === 'goods' ? 'goods' : 'service');
    if (!way || way.shape === 'deposit') continue;
    const usual = money(median(prices.slice(0, 10)));
    if (Math.abs(usual - way.priceUsual) <= way.priceUsual * USUAL_DRIFT) continue;
    out.push({
      key: `usual:${shape}:${usual}`,
      kind: 'usual-price',
      shape,
      priceUsdc: usual,
      deals: prices.length,
      line: `You agreed ${prices.length} deals at about ${usual} USDC. Make it your usual price?`,
    });
  }
  return out;
}

/// Three "Not for me" answers to budgets under a level: stop asking below it.
export function suggestedNoAskBelow(i: Pick<LearnedInputs, 'noAskBelowUsdc' | 'answered'>): Suggestion[] {
  const nos = i.answered
    .filter((q) => q.choice === 'no' && (q.kind === 'price-below-floor' || q.kind === 'counter-below-floor' || q.kind === 'last-price-passed'))
    .map((q) => q.priceUsdc ?? q.budgetUsdc)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  if (nos.length < THRESHOLD_NOS) return [];
  const level = money(Math.max(...nos.slice(0, 10)));
  if (i.noAskBelowUsdc && i.noAskBelowUsdc >= level) return [];
  return [{ key: `noask:${level}`, kind: 'no-ask-below', priceUsdc: level, line: `You said no to offers under ${level} USDC three times. Stop asking you below that?` }];
}

export function learnedSuggestions(i: LearnedInputs): Suggestion[] {
  const dismissed = new Set(i.dismissed);
  return [...suggestedWays(i), ...suggestedUsualPrice(i), ...suggestedNoAskBelow(i)].filter((s) => !dismissed.has(s.key));
}
