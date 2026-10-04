import type { DirectDeal } from '../db/deals.js';
import { listMessages, type ChatMessage } from '../db/messages.js';

/// The seller answered a dispute when, after it opened, they wrote in the trade
/// chat (as themselves or through their agent) or delivered again. System
/// messages and the buyer's own messages never count.
export function sellerResponded(
  deal: { seller: string; sellerAgentAddress?: string; disputedAt?: number; deliveredAt?: number },
  messages: Pick<ChatMessage, 'sender' | 'kind' | 'ts'>[],
): boolean {
  const since = deal.disputedAt ?? 0;
  if (deal.deliveredAt && deal.deliveredAt > since) return true;
  const sellerSide = new Set([deal.seller, deal.sellerAgentAddress].filter(Boolean).map((a) => a!.toLowerCase()));
  return messages.some((m) => m.kind !== 'system' && m.ts > since && sellerSide.has(m.sender.toLowerCase()));
}

export async function sellerRespondedAfterDispute(deal: DirectDeal): Promise<boolean> {
  return sellerResponded(deal, await listMessages(deal.jobId));
}
