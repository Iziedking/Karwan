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

/// The sentence the card shows, from the question's facts and suggestion.
export function questionLine(copy: AgentQuestionsCopy, q: AgentQuestion): string {
  const limit = q.facts.limit;
  const values = {
    budget: q.facts.budgetUsdc ?? '',
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
  return fill(template[q.kind], values);
}
