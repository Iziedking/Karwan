import type { DisplayCurrency, UsdcRates } from '../rates/usdcRates.js';
import { localiseUsdcText } from '../rates/localAmounts.js';
import type { AssistantAction } from './actions.js';

/// Every card and answer the assistant gives reads in the person's own
/// currency (view 77): a naira account sees "₦20,000", never "14.86 USDC".
/// Tools keep working in USDC underneath; only the words a person reads
/// change. A figure already said in their currency is left as said.
///
/// USDC stays where it is USDC by nature (view 55): sending to an outside
/// wallet, and moving money between networks.
const USDC_BY_NATURE = new Set([
  'cash_out',
  'top_up_to_arc',
  'remove_payout_address',
  'retry_money_move',
  'recheck_money_move',
  'cancel_money_move',
  'pause_money_out',
  'recheck_payout',
]);

export function localiseActions(
  actions: readonly AssistantAction[],
  currency: DisplayCurrency | undefined,
  rates: UsdcRates,
  locale = 'en',
): AssistantAction[] {
  if (!currency || currency === 'USDC') return [...actions];
  const say = (text: string) => localiseUsdcText(text, currency, rates, locale);
  return actions.map((a) => {
    if (a.kind !== 'confirm' || USDC_BY_NATURE.has(a.intent)) return a;
    return {
      ...a,
      title: say(a.title),
      ...(a.summary ? { summary: say(a.summary) } : {}),
      ...(a.warning ? { warning: say(a.warning) } : {}),
      ...(a.confirmLabel ? { confirmLabel: say(a.confirmLabel) } : {}),
      fields: a.fields.map((f) => ({ ...f, value: say(f.value) })),
    };
  });
}

/// The answer itself: the model is told to speak in the person's currency,
/// and this catches a figure it still gave in USDC. A turn that drew a card
/// where USDC is by nature keeps its words as written.
export function localiseAnswer(
  text: string,
  actions: readonly AssistantAction[],
  currency: DisplayCurrency | undefined,
  rates: UsdcRates,
  locale = 'en',
): string {
  if (actions.some((a) => a.kind === 'confirm' && USDC_BY_NATURE.has(a.intent))) return text;
  return localiseUsdcText(text, currency, rates, locale);
}
