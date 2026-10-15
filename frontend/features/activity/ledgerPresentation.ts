import { readableMovementText } from './receiptPresentation';

/// Durable movement references are support-safe identifiers. Keep the complete
/// value visible and copyable instead of reducing it to an ambiguous prefix.
export function ledgerReferenceLabel(refId: string | null | undefined): string | null {
  const value = refId?.trim();
  return value ? value : null;
}

export function ledgerStatusTone(status: 'done' | 'pending' | 'failed'): 'positive' | 'pending' | 'failed' {
  if (status === 'done') return 'positive';
  return status;
}

/// Which way the money went, from the recorded kind. The ledger is one list of
/// every movement on the account, so a row that only says "12.40 USDC" is
/// ambiguous between a payout received and a milestone released. The direction
/// is a property of the kind, not of the sentence, so it belongs here rather
/// than in a template per locale.
///
/// Unrecognised kinds are 'flat' on purpose: a movement whose direction we
/// cannot state is shown without a sign, never guessed at.
export type LedgerDirection = 'in' | 'out' | 'flat';

const INBOUND = new Set([
  'deposit',
  'top_up',
  'transfer_in',
  'payout',
  'yield_claim',
  'refund',
  'unstake',
  'financing_received',
  'financing_repayment',
  'gateway_deposit',
  'financing_repaid',
  // Karwan's own USDC arriving in the user's agent wallet at onboarding, so the
  // agent can pay for its first transactions. Nothing leaves the user, so the
  // ledger presents the seed as money in.
  'agent_seed',
]);

const OUTBOUND = new Set([
  'withdraw',
  'cash_out',
  'transfer_out',
  'release',
  'stake',
  // The user's own USDC moving from the sign-in wallet into their agent.
  'agent_topup',
  'agent_spend',
  'gateway_fund_agent',
  'gateway_cash_out',
  'financing_funded',
  'financing_repayment_sent',
  'agent_funding',
  // The buyer's money moving into escrow, and USDC bridged off Arc.
  'escrow_funding',
  'bridge',
]);

export function ledgerDirection(kind: string): LedgerDirection {
  if (INBOUND.has(kind)) return 'in';
  if (OUTBOUND.has(kind)) return 'out';
  return 'flat';
}

/// The amount as it belongs on a ledger row: signed by direction, unit always
/// spelled out. Returns null when the row carries no amount, so the caller
/// renders nothing rather than a lonely unit.
export function ledgerAmountLabel(
  amountUsdc: string | null | undefined,
  kind: string,
): string | null {
  const value = amountUsdc?.trim();
  if (!value) return null;
  const direction = ledgerDirection(kind);
  const sign = direction === 'in' ? '+' : direction === 'out' ? '-' : '';
  return `${sign}${displayUsdc(value)} USDC`;
}

/// Every amount on the statement has one shape: cents with grouped thousands,
/// so "20" and "19.997" never sit in one list as "20" and "20.00". Under 1 USDC
/// it keeps up to four places so a small fee never reads as zero. The receipt
/// keeps the exact amount.
export function displayUsdc(value: string): string {
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n)) return value;
  if (Math.abs(n) >= 1) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const small = n.toFixed(4).replace(/0+$/, '');
  const [whole, decimals = ''] = small.split('.');
  return `${whole}.${decimals.padEnd(2, '0')}`;
}

/// The row's sentence: plain words, amounts to the cent.
export function ledgerRowText(text: string): string {
  return readableMovementText(text).replace(/(\d+\.\d{3,}) USDC/g, (_, num: string) => `${displayUsdc(num)} USDC`);
}

export interface LedgerLineItem {
  summary: string;
  params?: Record<string, string> | null;
}

/// A ledger row's sentence in the reader's language. The backend sends
/// structured `params` with a `t` naming the template; anything it cannot name
/// falls back to the English `summary` written at record time, which is what
/// every row logged before `params` existed still carries.
export function ledgerLine(item: LedgerLineItem, texts: Record<string, string>): string {
  const params = item.params;
  const template = params?.t ? texts[params.t] : undefined;
  if (!template || !params) return readableMovementText(item.summary);
  return readableMovementText(
    template.replace(/\{(\w+)\}/g, (whole, key: string) => {
      const value = params[key] ?? whole;
      return key === 'to' && value.length > 12 ? 'counterparty' : value;
    }),
  );
}

export type LedgerFilter = 'all' | 'in' | 'out';

/// The statement's Money in and Money out views. A kind whose direction is not
/// known stays under All only, never guessed into either side.
export function filterByDirection<T extends { kind: string }>(items: readonly T[], filter: LedgerFilter): T[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => ledgerDirection(item.kind) === filter);
}

export type LedgerDay = 'today' | 'yesterday' | 'date';

/// Rows under their calendar day in the reader's time zone, in the order they
/// came (the API sends newest first). `start` is local midnight, for the
/// heading to format.
export function groupByDay<T>(
  rows: readonly T[],
  tsOf: (row: T) => number,
  now: number = Date.now(),
): { day: LedgerDay; start: number; rows: T[] }[] {
  const midnight = (ts: number) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = midnight(now);
  const yesterday = midnight(today - 1);
  const groups: { day: LedgerDay; start: number; rows: T[] }[] = [];
  for (const row of rows) {
    const start = midnight(tsOf(row));
    const last = groups[groups.length - 1];
    if (last && last.start === start) {
      last.rows.push(row);
      continue;
    }
    const day: LedgerDay = start === today ? 'today' : start === yesterday ? 'yesterday' : 'date';
    groups.push({ day, start, rows: [row] });
  }
  return groups;
}

/// What happened, in a word or two, so the amount is said once, in its column.
/// A kind with no title keeps its recorded sentence rather than going blank.
export function ledgerTitle(
  item: LedgerLineItem & { kind: string },
  titles: Record<string, string>,
  texts: Record<string, string>,
): string {
  return titles[item.kind] ?? ledgerRowText(ledgerLine(item, texts));
}

/// Who or where on the other side, when the record names it: a Karwan tag, a
/// network, a deal. A wallet address is never shown raw.
export function ledgerContext(item: { params?: Record<string, string> | null }): string | null {
  const params = item.params;
  if (!params) return null;
  const value = params.who ?? params.chain ?? params.job;
  if (!value || /^0x[0-9a-f]/i.test(value)) return null;
  return readableMovementText(value);
}
