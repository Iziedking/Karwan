export type FundSource = 'wallet' | 'otherAgent' | 'chain';

/// What a deal still needs once the money already in the paying wallet is
/// counted, rounded up to the cent so the top-up is never a fraction short.
/// An unknown balance asks for the whole amount.
export function fundingShortfall(needed: number, inPlace: number | null | undefined): number {
  if (inPlace === null || inPlace === undefined) return needed;
  const micros = Math.round(needed * 1e6) - Math.round(inPlace * 1e6);
  return micros <= 0 ? 0 : Math.ceil(micros / 1e4) / 100;
}

/// The source chosen for you: the first that covers the amount, in the order
/// the sheet lists them, and another chain when neither does. While balances
/// load, the wallet.
export function defaultFundRoute(amount: number, balances: { wallet: number | null; otherAgent: number | null }): FundSource {
  if (balances.wallet === null || balances.wallet >= amount) return 'wallet';
  if (balances.otherAgent !== null && balances.otherAgent >= amount) return 'otherAgent';
  return 'chain';
}
