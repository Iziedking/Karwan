import type { AgentQuestion } from '@/core/api';
import type { AgentQuestionsCopy } from '@/shared/i18n/messages/agentQuestions';

/// A request question is answered with an offer; a counter question acts on
/// the buyer's counter. The buyer's own near match has its own card, so none.
export type QuestionShape = 'request' | 'counter';

export function questionShape(kind: AgentQuestion['kind']): QuestionShape | null {
  if (kind === 'price-above-cap') return null;
  return kind === 'counter-below-floor' || kind === 'last-price-passed' ? 'counter' : 'request';
}

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function dayCount(copy: Pick<AgentQuestionsCopy, 'dayOne' | 'days'>, n: number | undefined): string {
  if (!n || !Number.isFinite(n)) return '';
  return n === 1 ? copy.dayOne : copy.days.replace('{n}', String(n));
}

/// Fills a sentence whose money values read in the person's currency.
export type MoneyFill = (template: string, money: Record<string, string | number | null | undefined>, vars: Record<string, string>) => string;

/// The sentence the card shows, from the question's facts and suggestion.
/// With a money filler, every USDC amount reads in the chosen currency too.
export function questionLine(copy: AgentQuestionsCopy, q: AgentQuestion, money?: MoneyFill): string {
  const limit = q.facts.limit;
  // View 73: a bargaining request's budget reads as a range.
  const range = q.facts.budgetRange ?? null;
  const values = {
    budget: q.facts.budgetUsdc ?? '',
    low: range ? String(range.lowUsdc) : '',
    high: range ? String(range.highUsdc) : '',
    limit: q.kind === 'time' ? dayCount(copy, Number(limit)) : limit == null ? '' : String(limit),
    price: q.suggested.priceUsdc ?? '',
    days: dayCount(copy, q.suggested.days),
    due: dayCount(copy, q.facts.dueDays),
    their: q.facts.theirPriceUsdc ?? '',
  };
  const template: Record<AgentQuestion['kind'], string> = {
    'no-way': copy.noWay,
    'price-below-floor': copy.belowFloor,
    'price-above-usual': copy.aboveUsual,
    time: copy.time,
    place: copy.place,
    'ask-first': copy.askFirst,
    'counter-below-floor': copy.counter,
    'last-price-passed': copy.counter,
    'price-above-cap': copy.counter,
  };
  const sentence = range ? template[q.kind].replace('{budget}', copy.budgetRange) : template[q.kind];
  if (!money) return fill(sentence, values);
  const amounts: Record<string, string | null> = {
    budget: q.facts.budgetUsdc ?? null,
    low: range ? String(range.lowUsdc) : null,
    high: range ? String(range.highUsdc) : null,
    price: q.suggested.priceUsdc ?? null,
    their: q.facts.theirPriceUsdc ?? null,
  };
  if (q.kind !== 'time' && limit != null) amounts.limit = String(limit);
  const rest = Object.fromEntries(Object.entries(values).filter(([key]) => !(key in amounts) || amounts[key] === null));
  return money(sentence, amounts, rest);
}
