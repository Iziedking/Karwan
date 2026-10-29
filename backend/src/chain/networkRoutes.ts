/// Route groups that need Karwan's own contracts. Where they are not deployed
/// (Arc mainnet before the suite ships) these answer 409 instead of reaching a
/// handler; the wallet routes (balances, deposits, bridging) stay open.
export const DEAL_ROUTE_PREFIXES = [
  '/api/jobs',
  '/api/agents',
  '/api/milestones',
  '/api/reputation',
  '/api/deals',
  '/api/cre',
  '/api/vault',
  '/api/guarantee',
  '/api/legacy',
  '/api/yield',
  '/api/treasury',
  '/api/listings',
  '/api/trade',
  '/api/factoring',
  '/api/po-financing',
  '/api/financier',
  '/api/sme',
  '/api/partners',
  '/api/business',
  '/api/x402',
];

/// With only the v3 deal escrow on a network, direct deals and offers run on
/// it; everything that reads the legacy job board, vault or reputation stays
/// closed and fails closed if reached.
const OPEN_WITH_V3_ESCROW = new Set(['/api/deals', '/api/listings']);

export function closedPrefixes(input: { legacyDeployed: boolean; v3EscrowDeployed: boolean }): string[] {
  if (input.legacyDeployed) return [];
  if (!input.v3EscrowDeployed) return DEAL_ROUTE_PREFIXES;
  return DEAL_ROUTE_PREFIXES.filter((p) => !OPEN_WITH_V3_ESCROW.has(p));
}
