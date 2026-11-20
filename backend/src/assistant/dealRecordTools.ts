import { tool } from 'ai';
import { z } from 'zod';
import type { Side, StoredDealRecord } from '../db/dealRecords.js';
import type { DirectDeal } from '../db/deals.js';
import { buildShareDealRecordConfirm, hasEquivalentConfirm, type AssistantAction } from './actions.js';

/// The deal record from any chat (view 94). Reading it and stopping a share
/// act at once; making a share link goes through a confirm card, because it
/// opens the person's deal to whoever gets the link.

export interface DealRecordToolDeps {
  deal: (jobId: string) => Promise<DirectDeal | null>;
  record: (jobId: string) => Promise<StoredDealRecord | null>;
  share: (jobId: string, side: Side) => Promise<string | null>;
  stop: (jobId: string, side: Side) => Promise<boolean>;
  base: string;
}

const NOT_YOURS = { error: 'That deal is not one of theirs.' };
const at = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : null);

export function dealRecordTools(address: string, actions: AssistantAction[], deps: DealRecordToolDeps) {
  const me = address.toLowerCase();
  const sideOf = async (jobId: string): Promise<{ deal: DirectDeal; side: Side } | null> => {
    const deal = await deps.deal(jobId);
    if (!deal) return null;
    const side: Side | null = deal.buyer?.toLowerCase() === me ? 'buyer' : deal.seller?.toLowerCase() === me ? 'seller' : null;
    return side ? { deal, side } : null;
  };
  const linkFor = (token: string) => `${deps.base.replace(/\/$/, '')}/deal-record/${token}`;
  const missing = (deal: DirectDeal) =>
    deal.settledAt || deal.cancelledAt
      ? { error: 'The record for this deal is still being written. It shows within the hour.' }
      : { error: 'This deal has not ended, so it has no record yet. Karwan writes one when it ends.' };

  return {
    deal_record: tool({
      description:
        "Read the signed record of one of the person's finished deals: what was agreed, the money held, how each stage's work was confirmed (buyer_confirmed, handover_code, buyer_silent, dispute, review_window, cancelled_by_both, refunded, not_recorded), what was released, and when Karwan signed it. Takes the deal reference (D68F-E7D8). Say it in the person's own language as short lines; name ways in plain words, never the codes.",
      inputSchema: z.object({ jobId: z.string().max(120).describe('The deal reference, such as D68F-E7D8, or its id.') }),
      execute: async ({ jobId }) => {
        const who = await sideOf(jobId);
        if (!who) return NOT_YOURS;
        const stored = await deps.record(who.deal.jobId);
        if (!stored) return missing(who.deal);
        const r = stored.record;
        const token = await deps.share(who.deal.jobId, who.side);
        return {
          reference: r.reference,
          side: who.side,
          kind: r.kind,
          ended: r.ended,
          endedAt: at(r.endedAt),
          agreed: { title: r.agreed.title, priceUsdc: r.agreed.priceUsdc, buyerAt: at(r.agreed.buyerAt), sellerAt: at(r.agreed.sellerAt) },
          held: r.held ? { usdc: r.held.usdc, at: at(r.held.at), tx: r.held.tx } : null,
          stages: r.stages.map((s) => ({
            stage: s.index + 1,
            confirmed: s.confirmed.way,
            confirmedAt: at(s.confirmed.at),
            ...(s.confirmed.decidedBy ? { decidedBy: s.confirmed.decidedBy } : {}),
            released: s.released
              ? { sellerUsdc: s.released.sellerUsdc, refundUsdc: s.released.refundUsdc, feeUsdc: s.released.feeUsdc, at: at(s.released.at), tx: s.released.tx }
              : null,
          })),
          signedByKarwanAt: at(stored.writtenAt),
          page: `${deps.base.replace(/\/$/, '')}/deals/${who.deal.jobId}`,
          sharedLink: token ? linkFor(token) : null,
        };
      },
    }),

    share_deal_record: tool({
      description:
        "Prepare a confirm card to share the signed record of one of the person's finished deals by a link. Whoever gets the link sees the record with names and Karwan tags, never wallet addresses, until the person stops sharing. If a link is already live it is returned with no card. Takes the deal reference.",
      inputSchema: z.object({ jobId: z.string().max(120).describe('The deal reference, such as D68F-E7D8, or its id.') }),
      execute: async ({ jobId }) => {
        const who = await sideOf(jobId);
        if (!who) return NOT_YOURS;
        const stored = await deps.record(who.deal.jobId);
        if (!stored) return missing(who.deal);
        const live = await deps.share(who.deal.jobId, who.side);
        if (live) return { alreadyShared: true, link: linkFor(live), next: 'This link is already live. They can stop sharing any time by asking.' };
        const built = buildShareDealRecordConfirm({ caller: address, jobId: who.deal.jobId, reference: stored.record.reference });
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    stop_sharing_deal_record: tool({
      description: "Stop sharing the record of one of the person's deals. The link stops working at once; a later share makes a new link.",
      inputSchema: z.object({ jobId: z.string().max(120).describe('The deal reference, such as D68F-E7D8, or its id.') }),
      execute: async ({ jobId }) => {
        const who = await sideOf(jobId);
        if (!who) return NOT_YOURS;
        const stopped = await deps.stop(who.deal.jobId, who.side);
        return stopped ? { stopped: true } : { stopped: false, error: 'That record was not being shared.' };
      },
    }),
  };
}
