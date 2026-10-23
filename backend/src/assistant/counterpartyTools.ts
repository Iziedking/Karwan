import { tool } from 'ai';
import { z } from 'zod';
import type { DirectDeal } from '../db/deals.js';

/// The people a user finished deals with, so "the seller I bought from last
/// month" has an answer without remembering a tag.

export interface PastCounterparty {
  address: string;
  deals: number;
  lastItem: string;
  lastAmountUsdc: string;
  lastAt: number;
  youWere: 'buyer' | 'seller';
}

export interface CounterpartyToolDeps {
  deals: (address: string) => Promise<DirectDeal[]>;
  profile: (address: string) => Promise<{ handle?: string; displayName?: string } | null>;
}

function itemLine(terms: string): string {
  const line = terms.replace(/\s+/g, ' ').trim();
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}...` : line;
}

export function pastCounterparties(deals: DirectDeal[], viewer: string): PastCounterparty[] {
  const me = viewer.toLowerCase();
  const byPerson = new Map<string, PastCounterparty>();
  for (const d of deals) {
    if (!d.settledAt || d.cancelledAt) continue;
    const isBuyer = d.buyer.toLowerCase() === me;
    const other = (isBuyer ? d.seller : d.buyer).toLowerCase();
    if (other === me) continue;
    const seen = byPerson.get(other);
    if (seen && seen.lastAt >= d.settledAt) {
      seen.deals += 1;
      continue;
    }
    byPerson.set(other, {
      address: other,
      deals: (seen?.deals ?? 0) + 1,
      lastItem: itemLine(d.terms ?? ''),
      lastAmountUsdc: d.dealAmountUsdc,
      lastAt: d.settledAt,
      youWere: isBuyer ? 'buyer' : 'seller',
    });
  }
  return [...byPerson.values()].sort((a, b) => b.lastAt - a.lastAt);
}

export function counterpartyTools(address: string, deps: CounterpartyToolDeps) {
  return {
    list_people_i_traded_with: tool({
      description:
        "The people the signed-in user finished deals with, most recent first: their name and Karwan tag, what was traded last, the amount, how many deals, and a link to start a new deal with them. Use when the user wants someone they traded with before ('the seller I bought from last month', 'buy again from the same person', 'who did I work with') and does not remember the tag. Answer with these people before searching the market. To deal with one of them again, use start_protected_deal with their tag.",
      inputSchema: z.object({}),
      execute: async () => {
        const people = pastCounterparties(await deps.deals(address), address).slice(0, 20);
        if (people.length === 0) return { people: [], note: 'You have no finished deals yet, so there is nobody to list.' };
        const named = await Promise.all(people.map(async (p) => {
          const profile = await deps.profile(p.address).catch(() => null);
          const tag = profile?.handle ? `@${profile.handle}` : null;
          return {
            name: profile?.displayName?.trim() || tag || 'A Karwan member',
            tag,
            deals: p.deals,
            lastItem: p.lastItem,
            lastAmountUsdc: p.lastAmountUsdc,
            lastDate: new Date(p.lastAt).toISOString().slice(0, 10),
            youWere: p.youWere,
            buyAgain: tag && p.youWere === 'buyer' ? `/buyer?mode=direct&seller=${tag}&amount=${p.lastAmountUsdc}` : null,
          };
        }));
        return { people: named };
      },
    }),
  };
}
