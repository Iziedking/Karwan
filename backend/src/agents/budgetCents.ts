/// A request's budget in whole cents, rounded down. Agents price in cents, so
/// a budget finer than a cent (300,000 naira is 222.877647 USDC) let a price
/// of 222.88 pass it. Rounded down so nobody commits more than they said. Pure.
export function budgetInCents(usdc: number): number {
  return Math.floor(Math.round(usdc * 1_000_000) / 10_000) / 100;
}
