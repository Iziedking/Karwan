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

export async function tradeChannelState(jobId: string, caller: string): Promise<ChannelState> {
  const deal = await getDeal(jobId);
  if (!deal || !deal.acceptedAt) return { allowed: false, writable: false };
  const who = caller.toLowerCase();
  if (who !== deal.buyer && who !== deal.seller) return { allowed: false, writable: false };
  const recipient = who === deal.buyer ? deal.seller : deal.buyer;
  if (deal.settledAt) return { allowed: true, writable: false, jobId, channelKey: jobId, recipient, closedAt: deal.settledAt, closedReason: 'settled' };
  if (deal.cancelledAt) return { allowed: true, writable: false, jobId, channelKey: jobId, recipient, closedAt: deal.cancelledAt, closedReason: 'cancelled' };
  return { allowed: true, writable: true, jobId, channelKey: jobId, recipient };
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
