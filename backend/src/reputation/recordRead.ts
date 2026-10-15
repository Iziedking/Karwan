import { keccak256, toHex } from 'viem';
import type { SealedDeal } from '../sealed/passport.js';
import type { Ladder } from '../verification/ladder.js';

/// A machine read of one person's Karwan record: every finished deal as an
/// outcome, with no names, amounts or counterparties in the clear. Pure, so the
/// same deals always give the same read.

export type ValueBand = 'lt50' | '50to250' | '250to1000' | 'gte1000';

export interface RecordOutcome {
  endedAt: number;
  success: boolean;
  onTime: boolean | null;
  valueBand: ValueBand;
  role: 'buyer' | 'seller';
  counterparty: string;
}

export interface RecordCounts {
  completed: number;
  onTimeRate: number | null;
  disputesWon: number;
  disputesLost: number;
  cancelled: number;
}

export interface RecordReadBody {
  version: 'karwan-record-v1';
  issuer: string;
  subject: { tag: string | null; address: string };
  level: Ladder;
  score: number;
  tier: string;
  counts: RecordCounts;
  outcomes: RecordOutcome[];
  issuedAt: number;
  expiresAt: number;
}

export interface RecordDeal extends SealedDeal {
  dealAmountUsdc?: string | number;
  disputeLoser?: 'buyer' | 'seller';
}

export const RECORD_READ_TTL_MS = 86_400_000;
export const MAX_OUTCOMES = 50;
const ON_TIME_MIN = 3;

export function valueBand(usdc: number): ValueBand {
  if (usdc < 50) return 'lt50';
  if (usdc < 250) return '50to250';
  if (usdc < 1000) return '250to1000';
  return 'gte1000';
}

/// The same pair always gives the same fingerprint, so a reader can count
/// repeat work with one client without learning who the client was.
export function counterpartyHash(pepper: string, subject: string, other: string): string {
  const [x, y] = [subject.toLowerCase(), other.toLowerCase()].sort();
  return keccak256(toHex(`${pepper}|${x}|${y}`));
}

const roleOf = (d: RecordDeal, me: string): 'buyer' | 'seller' => (d.seller.toLowerCase() === me ? 'seller' : 'buyer');

const mine = (deals: readonly RecordDeal[], me: string) =>
  deals.filter((d) => d.buyer.toLowerCase() === me || d.seller.toLowerCase() === me);

const onTimeOf = (d: RecordDeal, me: string): boolean | null =>
  roleOf(d, me) === 'seller' && d.deadlineUnix != null && d.deliveredAt != null
    ? d.deliveredAt <= d.deadlineUnix * 1000
    : null;

export function countsFor(deals: readonly RecordDeal[], subject: string): RecordCounts {
  const me = subject.toLowerCase();
  const all = mine(deals, me);
  const settled = all.filter((d) => d.settledAt != null && d.cancelledAt == null);
  const timed = settled.map((d) => onTimeOf(d, me)).filter((v): v is boolean => v !== null);
  return {
    completed: settled.length,
    onTimeRate: timed.length >= ON_TIME_MIN ? Math.round((timed.filter(Boolean).length / timed.length) * 100) : null,
    disputesWon: all.filter((d) => d.disputeLoser && d.disputeLoser !== roleOf(d, me)).length,
    disputesLost: all.filter((d) => d.disputeLoser && d.disputeLoser === roleOf(d, me)).length,
    cancelled: all.filter((d) => d.cancelledAt != null && d.settledAt == null).length,
  };
}

export function buildRecordRead(input: {
  issuer: string;
  subject: string;
  tag: string | null;
  level: Ladder;
  engineScore: number;
  tier: string;
  deals: readonly RecordDeal[];
  pepper: string;
  now: number;
}): RecordReadBody {
  const me = input.subject.toLowerCase();
  const finished = mine(input.deals, me)
    .filter((d) => d.settledAt != null || d.cancelledAt != null)
    .map((d) => ({ d, at: (d.settledAt ?? d.cancelledAt) as number }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_OUTCOMES);
  return {
    version: 'karwan-record-v1',
    issuer: input.issuer.toLowerCase(),
    subject: { tag: input.tag, address: me },
    level: input.level,
    score: Math.round(input.engineScore / 10),
    tier: input.tier,
    counts: countsFor(input.deals, me),
    outcomes: finished.map(({ d, at }) => ({
      endedAt: Math.floor(at / 1000),
      success: d.settledAt != null && d.cancelledAt == null && d.disputeLoser !== roleOf(d, me),
      onTime: onTimeOf(d, me),
      valueBand: valueBand(Number(d.dealAmountUsdc) || 0),
      role: roleOf(d, me),
      counterparty: counterpartyHash(input.pepper, me, roleOf(d, me) === 'seller' ? d.buyer : d.seller),
    })),
    issuedAt: input.now,
    expiresAt: input.now + RECORD_READ_TTL_MS,
  };
}
