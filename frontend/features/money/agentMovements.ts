/// Which movements belong to the agents (view 51), so the Agents tab can show
/// what they spent and what came in, from the same ledger as Recent.
const AGENT_KINDS = new Set(['agent_seed', 'agent_topup', 'agent_spend', 'gateway_fund_agent', 'agent_funding']);

export function isAgentMovement(item: { kind: string; summary?: string | null; params?: Record<string, string> | null }): boolean {
  if (AGENT_KINDS.has(item.kind)) return true;
  if (item.params?.agent === 'buyer' || item.params?.agent === 'seller') return true;
  return /\b(buying|selling|buyer|seller) agent\b/i.test(item.summary ?? '');
}
