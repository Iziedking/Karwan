import type { AgentKey } from './moneySheetModel';

/// Where "Bring it here" takes money from, and how much (view 77, B-06): the
/// agent holding more, for what is missing rounded up to the cent and capped at
/// what that agent holds, or all it holds when nothing in particular is missing.
export function bringFrom(
  agents: { buyer: number | null; seller: number | null },
  needUsdc?: number | null,
): { agent: AgentKey; amount: number } | null {
  const buyer = Math.max(0, agents.buyer ?? 0);
  const seller = Math.max(0, agents.seller ?? 0);
  const agent: AgentKey = seller > buyer ? 'seller' : 'buyer';
  const held = Math.floor((agent === 'seller' ? seller : buyer) * 1e6) / 1e6;
  if (!(held > 0)) return null;
  const need = needUsdc != null && needUsdc > 0 ? Math.ceil(Math.round(needUsdc * 1e6) / 1e4) / 100 : null;
  return { agent, amount: need === null ? held : Math.min(need, held) };
}
