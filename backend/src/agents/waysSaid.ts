import type { UsdcRates } from '../rates/usdcRates.js';
import { waysSchema, type AgentWays, type SaidPrices } from './ways.js';

/// Prices a person gives their agent in their own currency (view 77): the
/// figure typed is the rule. It is kept on the way beside the USDC the agent
/// works in, and that USDC is worked out from it again when the shared rate
/// changes, so "never below ₦30,000" stays ₦30,000.
///
/// Each kept figure remembers the USDC it last gave. A rule whose USDC was
/// changed some other way (the assistant in USDC, an older form) no longer
/// matches, and its figure is dropped instead of overwriting the change.

const MONEY = new Set(['priceMin', 'priceUsual', 'noAskBelow', 'deposit', 'rateMin', 'rateUsual', 'maxPrice', 'maxDeposit']);
/// To the micro, so the figure reads back exactly at the same rate.
const cents = (n: number) => Math.round(n * 1e6) / 1e6;
/// At save the figure and the USDC sent with it come from one field at one
/// rate; further apart than this, the figure is not what the person typed.
const SAVE_SLACK = 0.02;

type Way = { said?: SaidPrices } & Record<string, unknown>;

function wayAtRate<W extends Way>(way: W, rates: UsdcRates, fresh: boolean): W {
  const said = way.said;
  if (!said) return way;
  const rate = rates.rates[said.currency];
  if (!rate || rates.updatedAt === null) return way;
  const next: Record<string, unknown> = { ...way };
  const amounts: SaidPrices['amounts'] = {};
  for (const [field, kept] of Object.entries(said.amounts)) {
    const now = way[field];
    if (!MONEY.has(field) || typeof now !== 'number') continue;
    const usdc = cents(Number(kept.amount) / rate);
    if (!(usdc > 0)) continue;
    const stillTheirs = fresh ? Math.abs(usdc - now) <= now * SAVE_SLACK : kept.usdc === now;
    if (!stillTheirs) continue;
    next[field] = usdc;
    amounts[field] = { amount: kept.amount, usdc };
  }
  if (Object.keys(amounts).length === 0) delete next.said;
  else next.said = { currency: said.currency, amounts };
  return next as W;
}

/// The ways with every typed rule at the rate given. `fresh` is a save: the
/// figures arrive with the USDC the form worked out. A way the new figures
/// would make invalid (a lowest above a usual kept in USDC) is left as it was.
export function waysAtRate(ways: AgentWays, rates: UsdcRates, fresh = false): { ways: AgentWays; changed: boolean } {
  const side = <W extends Way>(list: W[]): W[] => list.map((way) => wayAtRate(way, rates, fresh));
  const next = { ...ways, sell: side(ways.sell as Way[]), buy: side(ways.buy as Way[]) } as unknown as AgentWays;
  const changed = JSON.stringify(next) !== JSON.stringify(ways);
  if (!changed) return { ways, changed: false };
  const valid = waysSchema.safeParse({ sell: next.sell, buy: next.buy });
  if (valid.success) return { ways: { ...ways, ...valid.data }, changed: true };
  // Keep every way that still stands on its own, one by one.
  const each = <W extends Way>(before: W[], after: W[], key: 'sell' | 'buy'): W[] =>
    after.map((way, i) => {
      const alone = key === 'sell' ? { sell: [way], buy: [] } : { sell: [], buy: [way] };
      return waysSchema.safeParse(alone).success ? way : before[i]!;
    });
  const kept = { ...ways, sell: each(ways.sell as Way[], next.sell as Way[], 'sell'), buy: each(ways.buy as Way[], next.buy as Way[], 'buy') } as unknown as AgentWays;
  return { ways: kept, changed: JSON.stringify(kept) !== JSON.stringify(ways) };
}

const hasSaid = (ways: AgentWays | undefined): ways is AgentWays =>
  !!ways && [...ways.sell, ...ways.buy].some((way) => (way as Way).said);

/// Brings every account's typed rules to the rate in force. Returns how many
/// accounts changed. Run when the shared rate changes; with no rate it does nothing.
export async function refreshSaidWays<P extends { address: string; agentWays?: AgentWays }>(deps: {
  list: () => Promise<P[]>;
  rates: () => Promise<UsdcRates>;
  save: (profile: P, ways: AgentWays) => Promise<void>;
}): Promise<number> {
  const rates = await deps.rates();
  if (rates.updatedAt === null) return 0;
  let n = 0;
  for (const profile of await deps.list()) {
    if (!hasSaid(profile.agentWays)) continue;
    const next = waysAtRate(profile.agentWays, rates);
    if (!next.changed) continue;
    await deps.save(profile, next.ways);
    n += 1;
  }
  return n;
}
