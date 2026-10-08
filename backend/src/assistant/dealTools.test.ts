import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { dealStepPendingLines } from './dealTools.js';

const buyer = '0x' + '1'.repeat(40);
const seller = '0x' + '2'.repeat(40);
const now = 1_800_000_000_000;

function deal(extra: Partial<DirectDeal>): DirectDeal {
  return { jobId: '0xdeal', buyer, seller, dealAmountUsdc: '100', acceptedAt: now - 1000, deadlineUnix: 1_800_100_000, ...extra } as DirectDeal;
}

test('an extension ask is the buyer\'s move and the seller\'s wait', () => {
  const d = deal({ extensionRequest: { requestedBy: 'seller', requestedAt: now, additionalSeconds: 2 * 86_400 } });
  const b = dealStepPendingLines(buyer, [d], now);
  assert.equal(b.actionNeeded.length, 1);
  assert.match(b.actionNeeded[0]!, /2 more days.*propose_extension/);
  const s = dealStepPendingLines(seller, [d], now);
  assert.equal(s.actionNeeded.length, 0);
  assert.match(s.waitingOnOthers[0]!, /waiting on the buyer/);
});

test('a cancellation proposal is the other side\'s move', () => {
  const d = deal({ cancellationProposal: { proposedBy: 'seller', kind: 'mutual', reason: 'Scope changed', proposedAt: now } });
  assert.match(dealStepPendingLines(buyer, [d], now).actionNeeded[0]!, /seller proposed cancelling \("Scope changed"\)/);
  assert.match(dealStepPendingLines(seller, [d], now).waitingOnOthers[0]!, /waiting on the other side/);
});

test('a dispute asks for a statement only while the window is open and theirs is missing', () => {
  const open = deal({ disputed: true, disputedAt: now - 1000, disputeStatements: { seller: { received: 'a', missing: 'b', late: 'c', links: [], submittedAt: now } } });
  assert.match(dealStepPendingLines(buyer, [open], now).actionNeeded[0]!, /needs their statement/);
  assert.equal(dealStepPendingLines(seller, [open], now).actionNeeded.length, 0);
  const closed = deal({ disputed: true, disputedAt: now - 10 * 86_400_000 });
  assert.equal(dealStepPendingLines(buyer, [closed], now).actionNeeded.length, 0);
});

test('closed deals and strangers produce nothing', () => {
  const d = deal({ settledAt: now, extensionRequest: { requestedBy: 'seller', requestedAt: now, additionalSeconds: 86_400 } });
  assert.deepEqual(dealStepPendingLines(buyer, [d], now), { actionNeeded: [], waitingOnOthers: [] });
  const live = deal({ extensionRequest: { requestedBy: 'seller', requestedAt: now, additionalSeconds: 86_400 } });
  assert.deepEqual(dealStepPendingLines('0x' + '9'.repeat(40), [live], now), { actionNeeded: [], waitingOnOthers: [] });
});
