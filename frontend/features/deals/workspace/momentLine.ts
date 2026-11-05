import type { DealView } from '@/core/api';
import type { DealPageCopy } from '@/shared/i18n/messages/dealPage';
import { fill } from './presentation';

/// Fills a sentence whose money values read in the person's chosen currency.
export type MoneyFill = (template: string, money: Record<string, string | number | null | undefined>, vars?: Record<string, string | number>) => string;

/// This moment (rule 3): whose move it is and one sentence in plain words.
/// The line on what happens on its own comes from automaticLine. Null when the
/// deal is over or nobody has a move.
export function momentFor(
  view: DealView,
  name: string,
  t: DealPageCopy,
  amount: string,
  money?: MoneyFill,
): { label: string; sentence: string | null } | null {
  if (view.stage === 'settled' || view.stage === 'cancelled') return null;
  const { action, actor } = view.next;
  if (actor === 'you') {
    const sentence =
      action === 'fund' ? (money && view.next.amountUsdc ? money(t.moment.fund, { amount: view.next.amountUsdc }, { name }) : fill(t.moment.fund, { amount, name }))
      : action === 'deliver' ? t.moment.deliver
      : action === 'release' ? fill(t.moment.release, { name })
      : action === 'accept' ? fill(t.moment.accept, { name })
      : action === 'claim' ? t.moment.claim
      : null;
    return { label: t.yourMove, sentence };
  }
  if (actor === 'counterparty') {
    const sentence =
      action === 'fund' ? fill(t.moment.waitFund, { name })
      : action === 'deliver' ? fill(t.moment.waitDeliver, { name })
      : action === 'release' ? fill(t.moment.waitRelease, { name })
      : action === 'accept' ? fill(t.moment.waitAccept, { name })
      // The seller after a delivery: the buyer's move is a review, which the
      // backend names for the buyer only.
      : view.stage === 'awaiting-first-release' || view.stage === 'awaiting-final-release' ? fill(t.moment.waitRelease, { name })
      : null;
    return { label: fill(t.waitingOn, { name }), sentence };
  }
  return null;
}
