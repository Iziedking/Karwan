import { getDeal } from '../db/deals.js';
import { getFactoringOffer } from '../db/factoring.js';
import { getPOLine } from '../db/poFinancing.js';

export interface ChannelState {
  allowed: boolean;
  writable: boolean;
  jobId?: string;
  channelKey?: string;
  recipient?: string;
  closedAt?: number;
  closedReason?: 'settled' | 'cancelled' | 'repaid' | 'defaulted';
}

export function isFinancingParty(caller: string, seller: string, financier: string): boolean {
  const who = caller.toLowerCase();
  return who === seller.toLowerCase() || who === financier.toLowerCase();
}

/// A party has to be a real wallet for there to be anyone on the other end. A
/// direct deal can name its seller by EMAIL invite, and until that invite is
/// claimed the seller slot holds a placeholder rather than an account: opening a
/// thread there would be a room with one person in it.
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isRealParty(address: string | undefined | null): boolean {
  const value = (address ?? '').toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(value) && value !== ZERO_ADDRESS;
}

/// The per-deal thread between the two parties.
///
/// It opens as soon as the deal names two real wallets. It used to require
/// `acceptedAt`, which does NOT mean "the deal exists": it means the escrow has
/// been funded and verified Accepted on chain. So neither side could say a word
/// until the money was already committed, which is the wrong way round. The
/// thread is where the terms get agreed; a buyer who has named a counterparty
/// and cannot ask them a question has no way to get to acceptance.
///
/// The cost of opening it earlier is that a deal can be created naming any
/// wallet, so the thread is reachable before either side has committed anything.
/// That is a spam surface, and it is the one the existing defences already
/// cover: every message is link-scanned before it is stored or broadcast, a
/// flagged link never reaches the counterparty and is recorded against the
/// sender's reputation (routes/chat.ts).
/// The rule itself, with the store lifted out so it can be tested. Access
/// control that cannot be unit-tested gets verified by clicking, and clicking is
/// how "neither party may speak until the escrow is funded" survived.
export function tradeChannelDecision(
  jobId: string,
  deal: TradeChannelDeal | null | undefined,
  caller: string,
): ChannelState {
  if (!deal) return { allowed: false, writable: false };
  const who = caller.toLowerCase();
  const buyer = (deal.buyer ?? '').toLowerCase();
  const seller = (deal.seller ?? '').toLowerCase();
  if (who !== buyer && who !== seller) return { allowed: false, writable: false };
  if (!isRealParty(buyer) || !isRealParty(seller)) {
    return { allowed: false, writable: false };
  }
  const recipient = who === buyer ? seller : buyer;
  if (deal.settledAt) {
    return { allowed: true, writable: false, jobId, channelKey: jobId, recipient, closedAt: deal.settledAt, closedReason: 'settled' };
  }
  if (deal.cancelledAt) {
    return { allowed: true, writable: false, jobId, channelKey: jobId, recipient, closedAt: deal.cancelledAt, closedReason: 'cancelled' };
  }
  return { allowed: true, writable: true, jobId, channelKey: jobId, recipient };
}

/// Only the fields the decision reads, so a test does not have to build a whole
/// deal to ask a question about two addresses.
export interface TradeChannelDeal {
  buyer: string;
  seller: string;
  settledAt?: number;
  cancelledAt?: number;
}

export async function tradeChannelState(jobId: string, caller: string): Promise<ChannelState> {
  return tradeChannelDecision(jobId, await getDeal(jobId), caller);
}

export async function financingChannelState(kind: 'factoring' | 'po', id: string, caller: string): Promise<ChannelState> {
  const who = caller.toLowerCase();
  if (kind === 'factoring') {
    const offer = await getFactoringOffer(id);
    if (!offer || !['accepted', 'settled', 'defaulted'].includes(offer.status)) return { allowed: false, writable: false };
    if (!isFinancingParty(who, offer.seller, offer.financier)) return { allowed: false, writable: false };
    const recipient = who === offer.seller ? offer.financier : offer.seller;
    if (offer.status === 'settled') return { allowed: true, writable: false, jobId: offer.invoiceId, channelKey: id, recipient, closedAt: offer.settledAt, closedReason: 'repaid' };
    if (offer.status === 'defaulted') return { allowed: true, writable: false, jobId: offer.invoiceId, channelKey: id, recipient, closedReason: 'defaulted' };
    return { allowed: true, writable: true, jobId: offer.invoiceId, channelKey: id, recipient };
  }
  const line = await getPOLine(id);
  if (!line || !['outstanding', 'repaid', 'defaulted'].includes(line.state)) return { allowed: false, writable: false };
  if (!isFinancingParty(who, line.seller, line.financier)) return { allowed: false, writable: false };
  const recipient = who === line.seller ? line.financier : line.seller;
  if (line.state === 'repaid') return { allowed: true, writable: false, jobId: line.invoiceId, channelKey: id, recipient, closedAt: line.repaidAt, closedReason: 'repaid' };
  if (line.state === 'defaulted') return { allowed: true, writable: false, jobId: line.invoiceId, channelKey: id, recipient, closedReason: 'defaulted' };
  return { allowed: true, writable: true, jobId: line.invoiceId, channelKey: id, recipient };
}
