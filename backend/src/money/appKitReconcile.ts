/// App Kit transfers between networks finish from their burn hash (view 60).
///
/// Circle's Forwarding Service mints on the other network whether or not the
/// process that started the transfer is still running. Circle's attestation
/// API, given the burn hash, says whether it minted and in which transaction,
/// so any process can finish the record. Nothing here sends money: a FAILED
/// forward and a transfer whose burn was never reported go to a person.

import type { BridgeRelay } from '../db/bridges.js';

/// The fields of one `GET /v2/messages` entry this decision reads.
export interface IrisMessage {
  status?: string;
  forwardState?: string;
  forwardTxHash?: string;
}

export type ForwardOutcome =
  | { kind: 'minted'; mintTxHash: string }
  | { kind: 'pending' }
  | { kind: 'failed' };

/// The same rule App Kit's own forwarder wait uses: CONFIRMED or COMPLETE with
/// a mint hash is done, FAILED means Circle did not mint, anything else waits.
export function forwardOutcome(messages: IrisMessage[] | null | undefined): ForwardOutcome {
  const message = messages?.[0];
  if (!message) return { kind: 'pending' };
  if (message.forwardState === 'FAILED') return { kind: 'failed' };
  const hash = message.forwardTxHash?.trim();
  if ((message.forwardState === 'CONFIRMED' || message.forwardState === 'COMPLETE') && hash) {
    return { kind: 'minted', mintTxHash: hash };
  }
  return { kind: 'pending' };
}

/// How long a transfer may sit with no burn hash before a person looks. A
/// burn App Kit is still submitting reports its hash well inside this.
export const NO_BURN_HOLD_MS = 30 * 60_000;

export type HoldReason = 'BRIDGE_FORWARD_FAILED' | 'BRIDGE_BURN_UNKNOWN';

export type ReconcileStep =
  | { kind: 'skip' }
  | { kind: 'read'; sourceDomain: number; burnTxHash: string }
  | { kind: 'hold'; reason: HoldReason }
  | { kind: 'wait' };

type Row = Pick<BridgeRelay, 'appKit' | 'status' | 'sourceTxHash' | 'sourceDomain' | 'createdAt' | 'held'>;

export function reconcileStep(row: Row, now: number): ReconcileStep {
  if (!row.appKit || row.held) return { kind: 'skip' };
  if (row.status === 'minted' || row.status === 'error') return { kind: 'skip' };
  const burnTxHash = row.sourceTxHash?.trim();
  if (burnTxHash) return { kind: 'read', sourceDomain: row.sourceDomain, burnTxHash };
  return now - row.createdAt >= NO_BURN_HOLD_MS ? { kind: 'hold', reason: 'BRIDGE_BURN_UNKNOWN' } : { kind: 'wait' };
}

export interface ReconcileDeps {
  rows: () => Promise<BridgeRelay[]>;
  /// `GET /v2/messages/{domain}?transactionHash=` entries, or null when the
  /// API has nothing yet or cannot be reached.
  messages: (sourceDomain: number, burnTxHash: string) => Promise<IrisMessage[] | null>;
  finish: (row: BridgeRelay, mintTxHash: string) => Promise<void>;
  hold: (row: BridgeRelay, reason: HoldReason) => Promise<void>;
  now: () => number;
}

export interface ReconcileReport {
  finished: string[];
  held: string[];
  waiting: string[];
}

/// One pass over every open App Kit transfer. Safe to run any number of times
/// and from any process: it only reads Circle's public attestation API, and a
/// finished or held row is skipped the next time.
export async function reconcileAppKitBridges(deps: ReconcileDeps): Promise<ReconcileReport> {
  const report: ReconcileReport = { finished: [], held: [], waiting: [] };
  for (const row of await deps.rows()) {
    const step = reconcileStep(row, deps.now());
    if (step.kind === 'skip') continue;
    if (step.kind === 'wait') {
      report.waiting.push(row.bridgeId);
      continue;
    }
    if (step.kind === 'hold') {
      await deps.hold(row, step.reason);
      report.held.push(row.bridgeId);
      continue;
    }
    const outcome = forwardOutcome(await deps.messages(step.sourceDomain, step.burnTxHash));
    if (outcome.kind === 'minted') {
      await deps.finish(row, outcome.mintTxHash);
      report.finished.push(row.bridgeId);
    } else if (outcome.kind === 'failed') {
      await deps.hold(row, 'BRIDGE_FORWARD_FAILED');
      report.held.push(row.bridgeId);
    } else {
      report.waiting.push(row.bridgeId);
    }
  }
  return report;
}
