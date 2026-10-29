import { tool } from 'ai';
import { z } from 'zod';

/// A seller who already agreed with someone sends them this link. On the web
/// only the buyer starts a protected deal, so the link opens the buyer's deal
/// form with the seller already filled in (view 38).

const NOTE = 'They open it, add the amount and terms you agreed, and pay into the deal. You accept before anything is final.';

export function sellerDealLink(base: string, tag: string): string {
  return `${base.replace(/\/+$/, '')}/buyer?mode=direct&seller=${encodeURIComponent(`@${tag}`)}`;
}

export interface DealLinkDeps {
  base: string;
  profile: (address: string) => Promise<{ handle?: string } | null>;
}

export async function shareMyDealLink(address: string, deps: DealLinkDeps): Promise<{ link: string; note: string } | { error: string }> {
  const tag = (await deps.profile(address))?.handle;
  if (!tag) return { error: 'They have no Karwan tag yet. Offer a button to their profile (destination "profile") to choose one.' };
  return { link: sellerDealLink(deps.base, tag), note: NOTE };
}

export function dealLinkTools(address: string, deps: DealLinkDeps) {
  return {
    share_my_deal_link: tool({
      description:
        "The link a seller sends to someone they already agreed a deal with: it opens the deal form with this person as the seller, the buyer adds the amount and terms and pays into the deal, and the seller accepts. Read-only. Use for 'how do I get paid by my client', 'send my client a deal', 'my customer wants to pay me safely'.",
      inputSchema: z.object({}),
      execute: async () => shareMyDealLink(address, deps),
    }),
  };
}
