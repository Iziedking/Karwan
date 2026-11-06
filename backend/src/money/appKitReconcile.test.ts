import assert from 'node:assert/strict';
import test from 'node:test';
import type { BridgeRelay } from '../db/bridges.js';
import {
  forwardOutcome,
  NO_BURN_HOLD_MS,
  reconcileAppKitBridges,
  reconcileStep,
  type HoldReason,
  type IrisMessage,
} from './appKitReconcile.js';

///   npx tsx --test src/money/appKitReconcile.test.ts

const NOW = 1_800_000_000_000;

function row(over: Partial<BridgeRelay> = {}): BridgeRelay {
  return {
    bridgeId: 'b1',
    sourceDomain: 6,
    sourceTxHash: '0xburn',
    amountUsdc: '10',
    mintRecipient: '0xowner',
    status: 'relaying',
    appKit: true,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    ...over,
  } as BridgeRelay;
}

test('Circle reports a forwarded mint the way App Kit reads it', () => {
  assert.deepEqual(forwardOutcome([{ status: 'complete', forwardState: 'COMPLETE', forwardTxHash: '0xmint' }]), { kind: 'minted', mintTxHash: '0xmint' });
  assert.deepEqual(forwardOutcome([{ forwardState: 'CONFIRMED', forwardTxHash: '0xmint' }]), { kind: 'minted', mintTxHash: '0xmint' });
  assert.deepEqual(forwardOutcome([{ forwardState: 'COMPLETE', forwardTxHash: '  ' }]), { kind: 'pending' });
  assert.deepEqual(forwardOutcome([{ status: 'pending' }]), { kind: 'pending' });
  assert.deepEqual(forwardOutcome([{ forwardState: 'FAILED' }]), { kind: 'failed' });
  assert.deepEqual(forwardOutcome([]), { kind: 'pending' });
  assert.deepEqual(forwardOutcome(null), { kind: 'pending' });
});

test('only open App Kit rows are read; a row with no burn waits, then goes to a person', () => {
  assert.deepEqual(reconcileStep(row(), NOW), { kind: 'read', sourceDomain: 6, burnTxHash: '0xburn' });
  assert.deepEqual(reconcileStep(row({ appKit: false }), NOW), { kind: 'skip' });
  assert.deepEqual(reconcileStep(row({ status: 'minted' }), NOW), { kind: 'skip' });
  assert.deepEqual(reconcileStep(row({ status: 'error' }), NOW), { kind: 'skip' });
  assert.deepEqual(reconcileStep(row({ held: { reason: 'BRIDGE_FORWARD_FAILED', at: NOW } }), NOW), { kind: 'skip' });
  assert.deepEqual(reconcileStep(row({ sourceTxHash: '', status: 'approving' }), NOW), { kind: 'wait' });
  assert.deepEqual(
    reconcileStep(row({ sourceTxHash: '', status: 'approving', createdAt: NOW - NO_BURN_HOLD_MS }), NOW),
    { kind: 'hold', reason: 'BRIDGE_BURN_UNKNOWN' },
  );
});

/// The process that started these transfers is gone: no App Kit listener is
/// left. The pass alone has to finish each one from what is on the row.
test('after a restart between burn and mint, each transfer is finished, held or left to wait', async () => {
  const rows = [
    row({ bridgeId: 'minted-by-circle', sourceTxHash: '0xa' }),
    row({ bridgeId: 'forward-failed', sourceTxHash: '0xb' }),
    row({ bridgeId: 'still-attesting', sourceTxHash: '0xc' }),
    row({ bridgeId: 'no-burn-old', sourceTxHash: '', status: 'approving', createdAt: NOW - NO_BURN_HOLD_MS - 1 }),
    row({ bridgeId: 'done-before', status: 'minted' }),
  ];
  const iris: Record<string, IrisMessage[] | null> = {
    '0xa': [{ status: 'complete', forwardState: 'COMPLETE', forwardTxHash: '0xmint-a' }],
    '0xb': [{ status: 'complete', forwardState: 'FAILED' }],
    '0xc': null,
  };
  const finished: Array<[string, string]> = [];
  const held: Array<[string, HoldReason]> = [];
  const report = await reconcileAppKitBridges({
    rows: async () => rows,
    messages: async (_domain, hash) => iris[hash] ?? null,
    finish: async (r, mint) => void finished.push([r.bridgeId, mint]),
    hold: async (r, reason) => void held.push([r.bridgeId, reason]),
    now: () => NOW,
  });
  assert.deepEqual(finished, [['minted-by-circle', '0xmint-a']]);
  assert.deepEqual(held, [['forward-failed', 'BRIDGE_FORWARD_FAILED'], ['no-burn-old', 'BRIDGE_BURN_UNKNOWN']]);
  assert.deepEqual(report.waiting, ['still-attesting']);
});
