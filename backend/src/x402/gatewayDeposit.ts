/// How much a paying agent moves onto the paid rail (Circle Gateway) before a
/// paid read, or null when its own wallet cannot cover the read. A short agent
/// sends nothing to the chain and works on free data (B-09, owner, 15 Nov 2026):
/// an approve and a deposit from an empty wallet only fail, and a dozen of them
/// at once held up every agent's research.
export function gatewayDepositUsd(neededUsd: number, walletUsd: number, configuredUsd: number): number | null {
  if (!(walletUsd >= neededUsd)) return null;
  return Math.min(Math.max(configuredUsd, neededUsd), walletUsd);
}

/// A USDC balance in base units (6 decimals) as dollars, floored to the unit.
export function usdcUnitsToUsd(units: bigint): number {
  return Number(units) / 1e6;
}
