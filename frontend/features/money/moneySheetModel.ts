import type { FundPhase } from '@/features/profile/hooks/useArcFund';
import type { CircleFundPhase } from '@/features/profile/hooks/useCircleFund';
import type { BridgePhase } from '@/features/bridge/hooks/useBridge';
import { fromMicros, toMicros } from './usdc';

export type MoneyMove = 'topUp' | 'withdraw' | 'send';
export type AgentKey = 'buyer' | 'seller';

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

/// A typed amount, or null when it is not one clear amount. Takes Arabic-Indic
/// digits and a comma or the Arabic decimal mark as the decimal point, with at
/// most six decimals. A thousands separator is refused rather than guessed at:
/// "1,000" is a thousand to one reader and one to another, so exactly three
/// digits after a single mark, behind a whole number that does not start with
/// zero, is not an amount.
export function parseAmount(input: string): number | null {
  const digits = input.trim().replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)));
  if (/^[1-9]\d{0,2}[.,٫]\d{3}$/.test(digits)) return null;
  const normalised = digits.replace(/[٫,]/g, '.');
  if (!/^\d+(\.\d{1,6})?$/.test(normalised)) return null;
  const value = Number(normalised);
  return value > 0 ? value : null;
}

/// Arc takes network fees in USDC from the same balance, so a wallet that signs
/// for itself keeps a little back on "Max". A transfer costs a fraction of a
/// cent at Arc's 20 gwei floor (docs.arc.io, gas and fees); one cent is ample.
export const WALLET_FEE_RESERVE = 0.01;

/// The most this move can take. A withdrawal is signed by the agent's wallet on
/// the backend, so it keeps nothing back.
export function spendable(available: number, move: MoneyMove, walletSigned: boolean): number {
  if (!walletSigned || move === 'withdraw') return available;
  return fromMicros(Math.max(0, toMicros(available) - toMicros(WALLET_FEE_RESERVE)));
}

/// A chip's amount: a share of what can be spent, rounded down to the cent so a
/// chip never asks for more than is there. Max is exact to the micro.
export function chipAmount(max: number, chip: 'quarter' | 'half' | 'max'): number {
  if (chip === 'max') return fromMicros(toMicros(max));
  const parts = chip === 'quarter' ? 4 : 2;
  return Math.floor(toMicros(max) / parts / 10_000) / 100;
}

export type RecipientStatus = 'ok' | 'missing' | 'invalid' | 'checking';
export type SheetBlocker = 'noAmount' | 'recipient' | 'loading' | 'short' | null;

/// Why the primary button cannot be pressed yet, in the order a person fixes
/// things: the amount, who it goes to, then whether the money is there.
export function sheetBlocker(facts: {
  move: MoneyMove;
  amount: number | null;
  available: number | null;
  recipient: RecipientStatus;
}): SheetBlocker {
  if (facts.amount === null) return 'noAmount';
  if (facts.move === 'send' && facts.recipient !== 'ok') return 'recipient';
  if (facts.available === null) return 'loading';
  if (toMicros(facts.amount) > toMicros(facts.available)) return 'short';
  return null;
}

export function shortfall(amount: number, available: number): number {
  return fromMicros(Math.max(0, toMicros(amount) - toMicros(available)));
}

/// An address in four-character groups, so a person can check it against the
/// one they were given.
export function groupAddress(address: string): string {
  const hex = address.trim().replace(/^0x/i, '');
  return `0x ${hex.match(/.{1,4}/g)?.join(' ') ?? ''}`.trim();
}

export type SheetState =
  | { kind: 'editing' }
  | { kind: 'signing' }
  | { kind: 'sent' }
  | { kind: 'confirmed'; reference: string | null; txHash: string | null }
  | { kind: 'slow'; reference: string | null; txHash: string | null }
  | { kind: 'reverted' }
  | { kind: 'failed'; declined: boolean };

export type SheetStep = 'signed' | 'sent' | 'confirmed';
export const SHEET_STEPS: SheetStep[] = ['signed', 'sent', 'confirmed'];

/// How far the progress line is: steps done, and the step in progress.
export function sheetProgress(state: SheetState): { done: number; current: SheetStep | null } | null {
  switch (state.kind) {
    case 'signing':
      return { done: 0, current: 'signed' };
    case 'sent':
      return { done: 1, current: 'sent' };
    case 'slow':
      return { done: 2, current: 'confirmed' };
    case 'confirmed':
      return { done: 3, current: null };
    default:
      return null;
  }
}

/// Money is in flight while it is being signed or sent; the sheet cannot be
/// dismissed then.
export function sheetBusy(state: SheetState): boolean {
  return state.kind === 'signing' || state.kind === 'sent';
}

const DECLINED = /cancel|declin|reject|denied/i;
const REVERTED = /revert/i;

type Ids = { reference?: string | null; txHash?: string | null };

function idsOf(record: Ids): { reference: string | null; txHash: string | null } {
  return { reference: record.reference ?? null, txHash: record.txHash ?? null };
}

/// A top-up signed by the person's own wallet (useArcFund). Once a hash exists
/// it is never shown as failed unless the chain reverted it.
export function fromArcFund(record: (Ids & { phase: FundPhase; error?: string }) | null): SheetState {
  if (!record) return { kind: 'signing' };
  switch (record.phase) {
    case 'switching':
    case 'signing':
      return { kind: 'signing' };
    case 'confirming':
      return { kind: 'sent' };
    case 'unconfirmed':
      return { kind: 'slow', ...idsOf(record) };
    // Confirmed on chain; Karwan's own record may still be catching up. The
    // money is with the agent either way.
    case 'settling':
    case 'done':
      return { kind: 'confirmed', ...idsOf(record) };
    case 'error':
      if (record.txHash) {
        return REVERTED.test(record.error ?? '') ? { kind: 'reverted' } : { kind: 'slow', ...idsOf(record) };
      }
      return { kind: 'failed', declined: DECLINED.test(record.error ?? '') };
  }
}

/// A top-up the backend signs for an email account (useCircleFund). "Settling"
/// covers both "moved, record behind" and "not confirmed either way", so the
/// sheet says the honest thing for both: it is waiting.
export function fromCircleFund(record: (Ids & { phase: CircleFundPhase }) | null): SheetState {
  if (!record) return { kind: 'sent' };
  switch (record.phase) {
    case 'sending':
      return { kind: 'sent' };
    case 'settling':
      return { kind: 'slow', ...idsOf(record) };
    case 'done':
      return { kind: 'confirmed', ...idsOf(record) };
    case 'error':
      return { kind: 'failed', declined: false };
  }
}

/// A same-chain send, which the transfer pipeline records like a bridge with
/// the chain key 'arc'. A wallet-signed send sits in 'burning' while the wallet
/// asks; a backend-signed one is already on its way.
export function fromArcSend(
  record: { phase: BridgePhase; burnTxHash?: string; mintTxHash?: string; error?: string } | null,
  signer: 'wallet' | 'account',
): SheetState {
  if (!record) return signer === 'wallet' ? { kind: 'signing' } : { kind: 'sent' };
  const txHash = record.mintTxHash ?? record.burnTxHash ?? null;
  switch (record.phase) {
    case 'switching':
    case 'approving':
      return { kind: 'signing' };
    case 'burning':
      return signer === 'wallet' ? { kind: 'signing' } : { kind: 'sent' };
    case 'relaying':
    case 'attesting':
    case 'minting':
      return { kind: 'slow', reference: null, txHash };
    case 'done':
      return { kind: 'confirmed', reference: null, txHash };
    case 'error':
      // The pipeline keeps a hash on an error only when the chain rejected it.
      if (record.burnTxHash) return { kind: 'reverted' };
      return { kind: 'failed', declined: DECLINED.test(record.error ?? '') };
  }
}

/// A move made through one backend call: an agent withdrawal, or a top-up from
/// the Gateway balance. Only a completed movement is confirmed.
export function fromMovementResponse(response: {
  movementState: string;
  txHash?: string | null;
  reference?: string | null;
}): SheetState {
  const ids = { reference: response.reference ?? null, txHash: response.txHash ?? null };
  return response.movementState === 'completed' ? { kind: 'confirmed', ...ids } : { kind: 'slow', ...ids };
}

/// A failed backend call. One that names a movement, or says a movement is
/// already in flight or needs attention, may have moved money: it waits.
export function fromMovementError(status: number, message: string, body: unknown): SheetState {
  const named = (body as { reference?: unknown } | null)?.reference;
  const reference = typeof named === 'string' ? named : null;
  if (reference || (status === 409 && /progress|attention/i.test(message))) {
    return { kind: 'slow', reference, txHash: null };
  }
  return { kind: 'failed', declined: false };
}

/// A server answer that cannot say whether money moved: a 5xx, a gateway
/// timeout or no answer at all. A 4xx is a refusal: nothing was sent.
export function isAmbiguousFailure(status: number | null): boolean {
  return status === null || status >= 500;
}

/// An email top-up the backend signs (POST /api/activation/fund-agent). A 202
/// carries a code saying the record is behind or the transfer unconfirmed.
export function fromFundingResponse(response: { code?: string; txHash?: string | null; reference?: string | null }): SheetState {
  const ids = { reference: response.reference ?? null, txHash: response.txHash ?? null };
  return response.code ? { kind: 'slow', ...ids } : { kind: 'confirmed', ...ids };
}

/// The same call, failed. Only `funding_failed` or a plain refusal says nothing
/// moved; a transfer in flight or an unclear failure waits, and "Check again"
/// re-asks with the same request id.
export function fromFundingError(status: number | null, code: string | undefined): SheetState {
  if (code === 'funding_failed') return { kind: 'failed', declined: false };
  if (code === 'funding_in_flight' || code === 'funding_unconfirmed' || code === 'funding_landed_unrecorded') {
    return { kind: 'slow', reference: null, txHash: null };
  }
  return isAmbiguousFailure(status) ? { kind: 'slow', reference: null, txHash: null } : { kind: 'failed', declined: false };
}

/// A re-check asks about a movement already in flight. Its answer may confirm
/// it, but never turns the wait into "nothing moved": a failed re-check says
/// nothing about the movement, only about the question.
export function afterRecheck(previous: SheetState, next: SheetState): SheetState {
  return previous.kind === 'slow' && (next.kind === 'failed' || next.kind === 'reverted') ? previous : next;
}

export type MoveDriver = 'walletTopUp' | 'accountTopUp' | 'poolTopUp' | 'send' | 'withdraw';

/// Which driver moves this request, or null when the request is incomplete. A
/// request missing its recipient or agent wallet moves nothing, rather than
/// falling through to another path.
export function driverFor(
  request: { move: MoneyMove; agent?: AgentKey; amount?: number; agentAddress?: string; recipient?: string; source?: 'balance' | 'pool' },
  walletSigned: boolean,
): MoveDriver | null {
  if (request.move === 'withdraw') return 'withdraw';
  if (request.move === 'send') return request.recipient ? 'send' : null;
  if (request.source === 'pool') return 'poolTopUp';
  if (!request.agentAddress) return null;
  return walletSigned ? 'walletTopUp' : 'accountTopUp';
}
