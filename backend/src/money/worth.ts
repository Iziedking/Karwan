import type { LocalAmount } from '../rates/quote.js';
import type { DisplayCurrency, LocalCurrency, UsdcRates } from '../rates/usdcRates.js';
import type { MoneyMovement } from './model.js';

/// Paid stays paid (view 77). When money moves, what it was worth to each side
/// in their own currency at that moment is kept on the movement. Activity,
/// receipts and messages read that figure from then on, so a payment made on
/// Monday reads the same on Friday. A statement does not change after the fact.

const wholeUnits = (currency: LocalCurrency) => currency === 'NGN' || currency === 'KES' || currency === 'XOF';

/// What an amount is worth in a currency at the rate in force.
export function worthOf(amountMicros: string | bigint, currency: LocalCurrency, rates: UsdcRates, now: number): LocalAmount | null {
  const rate = rates.rates[currency];
  if (!rate || rates.updatedAt === null) return null;
  const usdc = Number(amountMicros) / 1_000_000;
  return { currency, amount: (usdc * rate).toFixed(wholeUnits(currency) ? 0 : 2), rate, at: now };
}

export interface WorthDeps {
  /// The currency a person reads amounts in; undefined for an address that is
  /// not a person on Karwan (an agent wallet, an outside wallet).
  currencyOf: (address: string) => Promise<DisplayCurrency | undefined>;
  rates: () => Promise<UsdcRates>;
  now: () => number;
}

/// The worth of an amount to each of these people who reads a local currency.
export async function worthToPeople(amountMicros: string | bigint, addresses: readonly string[], deps: WorthDeps): Promise<Record<string, LocalAmount>> {
  const rates = await deps.rates();
  const people = new Set(addresses.map((a) => a.toLowerCase()));
  const worth: Record<string, LocalAmount> = {};
  for (const address of people) {
    const currency = await deps.currencyOf(address).catch(() => undefined);
    if (!currency || currency === 'USDC') continue;
    const figure = worthOf(amountMicros, currency, rates, deps.now());
    if (figure) worth[address] = figure;
  }
  return worth;
}

/// The worth of a movement to everyone on it who reads a local currency.
export function worthWhenPaid(movement: MoneyMovement, deps: WorthDeps): Promise<Record<string, LocalAmount>> {
  return worthToPeople(movement.amountMicros, [movement.initiatedBy, ...movement.participants.map((party) => party.address)], deps);
}

/// The figure one person reads for a movement: what they typed when they sent
/// it, otherwise what it was worth to them when it was paid. Undefined for a
/// payment from before worth was kept, which reads at the shared rate, marked
/// "about".
export function figureForViewer(movement: MoneyMovement, viewer: string | undefined): { currency: LocalCurrency; amount: string } | undefined {
  if (!viewer) return undefined;
  const me = viewer.toLowerCase();
  const kept = me === movement.initiatedBy.toLowerCase() && movement.local ? movement.local : movement.worth?.[me];
  return kept ? { currency: kept.currency, amount: kept.amount } : undefined;
}
