import type { DirectDeal } from '../db/deals.js';
import { dealStage } from './deskHome.js';

/// One deal on the desk's Deals page (view 79). A named allowlist: never the
/// terms beyond their first line, wallet ids, proofs or reviews.

export interface DeskDealRow {
  jobId: string;
  title: string;
  buyer: string;
  seller: string;
  buyerTag: string | null;
  sellerTag: string | null;
  amountUsdc: string;
  origin: string;
  stage: string;
  parts: number;
  createdAt: number;
  acceptedAt?: number;
  deliveredAt?: number;
  settledAt?: number;
  cancelledAt?: number;
  disputed: boolean;
  deadlineUnix?: number;
  dueAt: number | null;
}

const DAY = 86_400_000;
const REVIEW_DAYS = 3;
const TITLE_MAX = 80;

function titleOf(terms: string | undefined): string {
  const line = (terms ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? 'Deal';
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

function dueOf(d: DirectDeal): number | null {
  if (d.settledAt || d.cancelledAt) return null;
  if (d.delivered) {
    const start = d.reviewWindowStartedAt ?? d.deliveredAt;
    if (!start) return null;
    return start + (d.reviewWindowDays ?? REVIEW_DAYS) * DAY + (d.reviewExtensionMs ?? 0);
  }
  return d.deadlineUnix ? d.deadlineUnix * 1000 : null;
}

export function deskDealRow(d: DirectDeal, handleOf: (address: string) => string | null): DeskDealRow {
  return {
    jobId: d.jobId,
    title: titleOf(d.terms),
    buyer: d.buyer,
    seller: d.seller,
    buyerTag: handleOf(d.buyer),
    sellerTag: handleOf(d.seller) ?? d.sellerPaytag ?? null,
    amountUsdc: d.dealAmountUsdc,
    origin: d.origin ?? 'direct',
    stage: dealStage(d),
    parts: d.milestonePcts?.length ?? 2,
    createdAt: d.createdAt,
    ...(d.acceptedAt ? { acceptedAt: d.acceptedAt } : {}),
    ...(d.deliveredAt ? { deliveredAt: d.deliveredAt } : {}),
    ...(d.settledAt ? { settledAt: d.settledAt } : {}),
    ...(d.cancelledAt ? { cancelledAt: d.cancelledAt } : {}),
    disputed: d.disputed === true,
    ...(d.deadlineUnix ? { deadlineUnix: d.deadlineUnix } : {}),
    dueAt: dueOf(d),
  };
}
