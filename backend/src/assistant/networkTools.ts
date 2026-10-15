import { tool } from 'ai';
import { z } from 'zod';
import { getMarketplaceBriefs } from '../agents/buyer.js';
import { answerFromListing } from '../agentRail/sellerRules.js';
import { config } from '../config.js';
import { findAgentWalletByAgentAddress, getAgentWallets } from '../db/agentWallets.js';
import { getListing, listOpenListings } from '../db/listings.js';
import { getProfile } from '../db/profiles.js';
import { logger } from '../logger.js';
import { prohibitedReason } from '../policy/prohibited.js';
import { loadPublicPassport } from '../sealed/passportLoader.js';
import { levelOf } from '../verification/live.js';
import { buyerVisible, sellerMayBid } from '../verification/networkGate.js';
import { paidCreditPassport, paidRecordRead } from '../x402/buyerClient.js';
import { searchMarket } from './marketSearch.js';

/// The verified network from the assistant: find people agents may offer, and
/// ask their agent about price, timeline and terms. Answers come from what the
/// other person set; the record read is paid over x402 when enabled.
export function networkTools(address: string) {
  return {
    find_verified_people: tool({
      description:
        "Find people on Karwan's verified network: 'sellers' to buy from (only work-verified sellers are returned) or 'customers' to sell to (open requests from verified buyers). Returns name, tag, verification level, tier and reasons, never numbers. Use when the user wants their agent to find a supplier, freelancer or customer.",
      inputSchema: z.object({
        need: z.string().min(2).max(200).describe('What they are looking for, in their words.'),
        side: z.enum(['sellers', 'customers']),
        budgetUsdc: z.number().positive().max(10_000_000).optional(),
      }),
      execute: async ({ need, side, budgetUsdc }) => {
        const refused = prohibitedReason(need);
        if (refused) return { refused: true, message: refused.message };
        try {
          const now = Date.now();
          const enabled = config.VERIFIED_NETWORK_ONLY;
          if (side === 'sellers') {
            const offers = listOpenListings().filter((l) => l.expiresAt > now && !prohibitedReason(l.title, l.description, l.terms));
            const hits = searchMarket({ query: need, kind: 'offers', maxPriceUsdc: budgetUsdc, excludeSeller: address, limit: 15 }, offers, []);
            const people = [];
            for (const hit of hits) {
              if (hit.kind !== 'offer' || people.length >= 5) continue;
              const level = await levelOf(hit.sellerUser);
              if (!sellerMayBid({ enabled, level }).ok) continue;
              const passport = await loadPublicPassport(hit.sellerUser);
              people.push({
                listingId: hit.id,
                offer: hit.title,
                priceUsdc: hit.priceUsdc,
                name: passport.displayName ?? 'A Karwan seller',
                tag: passport.tag ? `@${passport.tag}` : null,
                level,
                tier: passport.tier,
                reasons: passport.reasons,
              });
            }
            return { count: people.length, people, next: people.length ? 'Offer to ask their agent about price, timeline or terms.' : 'No verified seller fits yet. Offer to post a request so verified sellers can offer.' };
          }

          const briefs = getMarketplaceBriefs().filter((b) => !prohibitedReason(b.briefText));
          const hits = searchMarket({ query: need, kind: 'requests', limit: 15 }, [], briefs);
          const customers = [];
          for (const hit of hits) {
            if (hit.kind !== 'request' || customers.length >= 5) continue;
            const brief = briefs.find((b) => b.jobId === hit.jobId);
            const owner = brief ? await findAgentWalletByAgentAddress(brief.buyer) : null;
            if (!owner || owner.userAddress.toLowerCase() === address.toLowerCase()) continue;
            const level = await levelOf(owner.userAddress);
            if (!buyerVisible({ enabled, level })) continue;
            const profile = await getProfile(owner.userAddress).catch(() => null);
            customers.push({
              jobId: hit.jobId,
              request: hit.title,
              budgetUsdc: hit.budgetUsdc,
              due: new Date(hit.dueUnix * 1000).toISOString().slice(0, 10),
              name: profile?.displayName?.trim() || 'A Karwan buyer',
              level,
            });
          }
          return { count: customers.length, customers };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant find_verified_people failed');
          return { error: 'Could not search the network right now.' };
        }
      },
    }),

    ask_their_agent: tool({
      description:
        "Ask a seller's agent about one offer: 'price' (asking and the lowest they set), 'timeline' (days to deliver) or 'terms'. The answer comes only from what the seller set; anything they did not set is unknown. When paid agent queries are on, the user's buyer agent also reads the seller's record over x402 for a fraction of a cent.",
      inputSchema: z.object({
        listingId: z.string().min(1).max(80),
        topic: z.enum(['price', 'timeline', 'terms']),
        budgetUsdc: z.number().positive().max(10_000_000).optional(),
      }),
      execute: async ({ listingId, topic, budgetUsdc }) => {
        const listing = getListing(listingId);
        if (!listing || listing.expiresAt <= Date.now()) return { error: 'That offer is no longer open.' };
        const answer = answerFromListing(listing, { topic, budgetUsdc });
        if (config.RECORD_READS_ENABLED) {
          try {
            const wallets = await getAgentWallets(address);
            if (!wallets?.buyerAddress) return { answer, paidRecordRead: null };
            const r = await paidRecordRead(wallets.buyerAddress, listing.sellerUser, { purpose: 'question', ref: listingId, forAccount: address });
            return {
              answer,
              paidRecordRead: { score: r.read.score, completedDeals: r.read.counts.completed, onTimePercent: r.read.counts.onTimeRate, paidUsdc: r.amountUsd, proofTx: r.depositTxHash ?? null },
            };
          } catch (err) {
            logger.warn({ err: (err as Error).message }, 'assistant ask_their_agent record read failed');
            return { answer, paidRecordRead: null, note: 'The record check did not go through; the answer stands.' };
          }
        }
        if (!config.X402_AGENT_QUERIES) return { answer, paidRecordRead: null };
        try {
          const wallets = await getAgentWallets(address);
          if (!wallets?.buyerAddress) return { answer, paidRecordRead: null };
          const read = await paidCreditPassport(wallets.buyerAddress, listing.sellerUser);
          return {
            answer,
            paidRecordRead: { tier: read.tier, paidUsdc: read.amountUsd, proofTx: read.depositTxHash ?? null },
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant ask_their_agent paid read failed');
          return { answer, paidRecordRead: null, note: 'The paid record read did not go through; the answer stands.' };
        }
      },
    }),
  };
}
