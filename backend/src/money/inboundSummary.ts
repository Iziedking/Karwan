/// The activity line for USDC moved onto Arc. Money that lands in the sender's
/// own wallets is "Added"; money sent to someone else, such as paying their
/// payment link, is "Sent", named by their Karwan tag when they have one.

import { getAgentWallets } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';

export function inboundSummaryText(input: {
  amountUsdc: string;
  chain: string;
  toSelf: boolean;
  recipient?: string;
  recipientTag?: string;
}): string {
  if (input.toSelf || !input.recipient) return `Added ${input.amountUsdc} USDC from ${input.chain} to Arc`;
  const who = input.recipientTag ? `@${input.recipientTag}` : `${input.recipient.slice(0, 6)}…${input.recipient.slice(-4)}`;
  return `Sent ${input.amountUsdc} USDC from ${input.chain} to ${who}`;
}

export async function inboundSummary(input: {
  amountUsdc: string;
  chain: string;
  owner: string;
  recipient?: string;
}): Promise<string> {
  const owner = input.owner.toLowerCase();
  const recipient = input.recipient?.toLowerCase();
  if (!recipient || recipient === owner) return inboundSummaryText({ ...input, toSelf: true });
  const wallets = await getAgentWallets(owner).catch(() => null);
  const own = [wallets?.buyerAddress, wallets?.sellerAddress].some((a) => a?.toLowerCase() === recipient);
  if (own) return inboundSummaryText({ ...input, toSelf: true });
  const profile = await getProfile(recipient).catch(() => null);
  return inboundSummaryText({ ...input, toSelf: false, recipient, recipientTag: profile?.handle });
}
