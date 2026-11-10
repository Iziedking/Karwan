import type { ChoiceView } from '@/core/api';
import type { ChosenCopy } from '@/shared/i18n/messages/chosen';

/// What the buyer reads above their shortlist while a choice waits on the
/// seller (view 75), and the moves it leaves them.
export interface BuyerChoiceLine {
  /// The sentence, with "{amount}" left for the screen to fill in the person's money.
  template: string;
  /// The amount for that slot, when the sentence has one.
  amountUsdc: number | null;
  canTakeBack: boolean;
  /// A higher price the buyer may approve.
  approveUsdc: number | null;
}

const put = (template: string, values: Record<string, string>) =>
  template.replace(/\{(name|date)\}/g, (m, k: string) => values[k] ?? m);

export function buyerChoiceLine(choice: ChoiceView | null | undefined, name: string, date: string, copy: ChosenCopy): BuyerChoiceLine | null {
  if (!choice) return null;
  if (choice.state === 'declined') {
    return { template: put(copy.declined, { name }), amountUsdc: null, canTakeBack: false, approveUsdc: null };
  }
  if (choice.state === 'raised' && choice.raisedPriceUsdc) {
    const raised = Number(choice.raisedPriceUsdc);
    return { template: put(copy.raised, { name }), amountUsdc: raised, canTakeBack: true, approveUsdc: raised };
  }
  return { template: put(copy.waiting, { name, date }), amountUsdc: null, canTakeBack: true, approveUsdc: null };
}

/// When the choice lapses, in the reader's own time.
export function answerByText(answerBy: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(answerBy);
}
