import { createSchema, type CreateDirectDealBody } from '../deals/createSchema.js';

/// The assistant's answers turned into the exact body POST /api/deals/direct
/// takes (view 24). Pure: the tool resolves who the seller is, this decides
/// everything else and refuses what the route would refuse.

/// A deal sent from an assistant conversation carries this in its
/// sourceContext.reference, so the conversation can offer the payment once the
/// seller accepts.
export const conversationReference = (id: string) => `assistant:${id}`;

export type Counterparty = { sellerAddress: string } | { sellerEmail: string };

export interface DealAnswers {
  what: string;
  amountUsdc: number;
  /// A calendar date (YYYY-MM-DD). Turned into days and hours here, never by the model.
  deliverBy?: string;
  deliverInDays?: number;
  /// Parts of the payment in percent, first part first. Default: one payment.
  payments?: number[];
  reviewDays?: number;
  acceptWithinHours?: number;
  tradeType?: 'service' | 'goods' | 'mixed';
  /// Goods only: shipped, or handed over in person (view 32).
  goodsWay?: 'shipped' | 'in_person';
  incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
  paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90';
  company?: { name?: string; sector?: string; region?: string };
  /// Percent of the deal the seller backs with stake, 50 to 100. Absent: no stake.
  stakePct?: number;
  evidenceRequired?: boolean;
  personCheck?: boolean;
}

const HOUR = 3_600_000;

/// Days and hours from now until the end of `date` (UTC), or a reason it can't be.
export function deadlineFromDate(date: string, now: number): { days: number; hours: number } | { error: string } {
  const end = Date.parse(`${date}T23:59:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(end)) return { error: 'That date could not be read. Give it as a day, month and year.' };
  const hours = Math.floor((end - now) / HOUR);
  if (hours < 1) return { error: 'That date has already passed.' };
  if (hours > 180 * 24) return { error: 'A deal can run for at most 180 days.' };
  return { days: Math.floor(hours / 24), hours: hours % 24 };
}

export function dealBody(
  buyerAddress: string,
  seller: Counterparty,
  a: DealAnswers,
  now: number,
): { ok: true; body: CreateDirectDealBody } | { ok: false; message: string } {
  let days = 0;
  let hours = 0;
  if (a.deliverBy) {
    const d = deadlineFromDate(a.deliverBy, now);
    if ('error' in d) return { ok: false, message: d.error };
    ({ days, hours } = d);
  } else if (a.deliverInDays) {
    days = a.deliverInDays;
  }
  const payments = a.payments?.length ? a.payments : [100];
  const goods = a.tradeType === 'goods' || a.tradeType === 'mixed';
  const raw = {
    buyerAddress,
    ...seller,
    dealAmountUsdc: a.amountUsdc,
    deadlineDays: days,
    deadlineHours: hours,
    acceptanceWindowHours: a.acceptWithinHours ?? 24,
    terms: a.what.trim(),
    firstReleasePct: payments[0],
    ...(payments.length > 1 ? { milestonePcts: payments } : {}),
    ...(a.reviewDays ? { reviewWindowDays: a.reviewDays } : {}),
    requireStake: a.stakePct !== undefined,
    ...(a.stakePct !== undefined ? { requireStakePct: a.stakePct } : {}),
    ...(a.tradeType ? { tradeType: a.tradeType } : {}),
    ...(goods && a.goodsWay ? { goodsWay: a.goodsWay } : {}),
    ...(goods && a.incoterms ? { incoterms: a.incoterms } : {}),
    ...(goods && a.paymentTerms ? { paymentTerms: a.paymentTerms } : {}),
    ...(goods && a.company ? { counterpartyCompany: a.company } : {}),
    evidenceRequired: a.evidenceRequired ?? false,
    verificationPolicy: a.personCheck ? ('high_signal' as const) : ('standard' as const),
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: plainIssue(parsed.error.issues[0]) };
  return { ok: true, body: parsed.data };
}

function plainIssue(issue: { path: PropertyKey[]; message: string } | undefined): string {
  const field = String(issue?.path[0] ?? '');
  if (field === 'milestonePcts' || field === 'firstReleasePct') return 'The payment parts must be whole percents that add up to 100, at most five parts.';
  if (field === 'requireStakePct') return 'Stake can be 50 to 100 percent, in steps of 5.';
  if (field === 'deadlineHours' || field === 'deadlineDays') return 'A deadline must be at least an hour away and at most 180 days.';
  if (field === 'acceptanceWindowHours') return 'They can be given between 15 minutes and 30 days to accept.';
  if (field === 'reviewWindowDays') return 'The review time can be 1 to 90 days.';
  if (field === 'terms') return 'Say what the deal is for, in up to 4,000 characters.';
  if (field === 'dealAmountUsdc') return 'The amount must be more than zero.';
  return issue?.message ?? 'Those terms could not be used.';
}

const TRADE: Record<string, string> = { service: 'Work', goods: 'Goods', mixed: 'Goods and work' };
const TERMS: Record<string, string> = { immediate: 'Paid on delivery', net30: 'Within 30 days', net60: 'Within 60 days', net90: 'Within 90 days' };

/// The card's rows: every term that will be sent, in plain words.
export function dealCardFields(body: CreateDirectDealBody, sellerLabel: string, buyerPaysUsdc: string | null): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'With', value: sellerLabel },
    { label: 'For', value: body.terms },
    { label: 'Amount', value: `${body.dealAmountUsdc} USDC` },
    {
      label: 'You pay into escrow',
      value: buyerPaysUsdc ? `${buyerPaysUsdc} USDC with the fee, after they accept` : 'The amount plus the fee shown when you pay, after they accept',
    },
  ];
  const days = body.deadlineDays ?? 0;
  const hours = body.deadlineHours ?? 0;
  rows.push({ label: 'Deliver within', value: days || hours ? [days ? `${days} days` : '', hours ? `${hours} hours` : ''].filter(Boolean).join(' ') : 'No deadline' });
  const parts = body.milestonePcts ?? [body.firstReleasePct];
  rows.push({ label: 'Payment', value: parts.length > 1 ? `${parts.length} parts: ${parts.map((p) => `${p}%`).join(', ')}` : 'One payment on delivery' });
  if (body.reviewWindowDays) rows.push({ label: 'Days to check each delivery', value: String(body.reviewWindowDays) });
  rows.push({ label: 'They have to accept within', value: `${body.acceptanceWindowHours} hours` });
  if (body.tradeType) rows.push({ label: 'Type', value: TRADE[body.tradeType] ?? body.tradeType });
  if (body.goodsWay) rows.push({ label: 'How it reaches you', value: body.goodsWay === 'in_person' ? 'Handed over in person' : 'Shipped' });
  if (body.incoterms) rows.push({ label: 'Delivery terms', value: body.incoterms });
  if (body.paymentTerms) rows.push({ label: 'Payment terms', value: TERMS[body.paymentTerms] ?? body.paymentTerms });
  if (body.counterpartyCompany?.name) rows.push({ label: 'Company', value: body.counterpartyCompany.name });
  if (body.requireStake) rows.push({ label: 'Seller backs it with stake', value: `${body.requireStakePct}%` });
  if (body.evidenceRequired) rows.push({ label: 'Delivery proof', value: 'Required' });
  if (body.verificationPolicy === 'high_signal') rows.push({ label: 'Person check', value: 'Required for the seller' });
  return rows;
}
