import { formatLocalAmount } from '../rates/localAmounts.js';
import type { DisplayCurrency, UsdcRates } from '../rates/usdcRates.js';

/// The currency the assistant speaks in, from the account's own setting
/// (owner, 6 Nov 2026). Every channel runs the same turn, so the website,
/// Help and Telegram all ask "How much do you want to request?" in naira for a
/// person who reads naira, never "How much USDC". Empty for USDC readers.
export function moneyVoice(currency: DisplayCurrency | undefined, rates: UsdcRates): string {
  if (!currency || currency === 'USDC') return '';
  const one = formatLocalAmount(1, currency, rates);
  if (!one) {
    return `This person reads amounts in ${currency}, but there is no fresh ${currency} rate right now: say amounts in USDC and ask for them in USDC until the rate is back.`;
  }
  const example = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(50_000);
  return [
    `This person reads money in ${currency}. Say every amount in ${currency} only, written like ${example}, with no USDC beside it, and ask for amounts in ${currency}: "How much do you want to request?", never "How much USDC".`,
    `When they give a figure, pass it to the tool exactly as said with currency ${currency}; Karwan works out the USDC at today's rate. Tools return USDC: say those figures in ${currency} at today's rate, 1 USDC = ${one}.`,
    'Name USDC only where it is USDC by nature: the exact USDC to send from another network, moving between networks, and a withdrawal to an outside wallet.',
  ].join(' ');
}
