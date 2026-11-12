import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminDealRow, AdminDisputeRow } from '@/core/api';
import { DEAL_VIEWS, dealLine, dealsShown, disputeList, DISPUTE_VIEWS } from './deskDeals';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 12, 12);

function deal(over: Partial<AdminDealRow>): AdminDealRow {
  return {
    jobId: '0x3c88000000000000000000000000000000001111', title: 'Logo and brand pack', buyer: '0xb', seller: '0xs', buyerTag: 'wanjiru', sellerTag: 'ada',
    amountUsdc: '50', origin: 'direct', stage: 'accepted', parts: 2, createdAt: NOW - 5 * DAY, disputed: false, dueAt: NOW + 6 * DAY, ...over,
  };
}

test('each deal reads a step and a status in plain words', () => {
  assert.deepEqual(dealLine(deal({}), NOW), { view: 'progress', step: 'Work started', status: 'On time', tone: 'green' });
  assert.deepEqual(dealLine(deal({ stage: 'delivered' }), NOW), { view: 'buyer', step: 'Delivered, buyer checks', status: 'Waiting on buyer', tone: 'amber' });
  assert.deepEqual(dealLine(deal({ dueAt: NOW - 2 * DAY - 60_000 }), NOW), { view: 'late', step: 'Work started', status: 'Late 2 days', tone: 'red' });
  assert.deepEqual(dealLine(deal({ dueAt: NOW - 3_600_000 }), NOW).status, 'Late today');
  assert.deepEqual(dealLine(deal({ stage: 'disputed', disputed: true }), NOW), { view: 'dispute', step: 'Statements in', status: 'In dispute', tone: 'red' });
  assert.deepEqual(dealLine(deal({ stage: 'open' }), NOW), { view: 'progress', step: 'Waiting for the seller', status: 'Not started', tone: 'grey' });
  assert.deepEqual(dealLine(deal({ stage: 'settled' }), NOW), { view: 'done', step: 'Paid out', status: 'Done', tone: 'green' });
  assert.deepEqual(dealLine(deal({ stage: 'cancelled' }), NOW), { view: 'done', step: 'Cancelled', status: 'Cancelled', tone: 'grey' });
});

test('the lists are In progress, Waiting on the buyer, Late, In dispute and Done', () => {
  assert.deepEqual(DEAL_VIEWS.map((v) => v.label), ['In progress', 'Waiting on the buyer', 'Late', 'In dispute', 'Done']);
});

test('In progress holds every open deal; search finds by deal number, tag or title across every list', () => {
  const rows = [
    deal({ jobId: '0xaaa1', stage: 'accepted' }),
    deal({ jobId: '0xaaa2', stage: 'delivered', buyerTag: 'kingizie' }),
    deal({ jobId: '0xaaa3', dueAt: NOW - DAY }),
    deal({ jobId: '0xaaa4', stage: 'settled', title: 'Teach my kid to code' }),
  ];
  assert.deepEqual(dealsShown(rows, 'progress', '', NOW).map((d) => d.jobId), ['0xaaa1', '0xaaa2', '0xaaa3']);
  assert.deepEqual(dealsShown(rows, 'late', '', NOW).map((d) => d.jobId), ['0xaaa3']);
  assert.deepEqual(dealsShown(rows, 'progress', '@kingizie', NOW).map((d) => d.jobId), ['0xaaa2']);
  assert.deepEqual(dealsShown(rows, 'progress', 'teach', NOW).map((d) => d.jobId), ['0xaaa4']);
  assert.deepEqual(dealsShown(rows, 'done', '0xAAA3', NOW).map((d) => d.jobId), ['0xaaa3']);
});

function dispute(over: Partial<AdminDisputeRow>): AdminDisputeRow {
  return { jobId: '0xd1', buyer: '0xb', seller: '0xs', dealAmountUsdc: '100', disputedAt: NOW, disputedBy: 'buyer', ...over };
}
const said = { received: 'a', missing: 'b', late: 'c', links: [], submittedAt: NOW };

test('a dispute needs a ruling once both sides spoke or the judge proposed; else it waits on a party', () => {
  assert.deepEqual(DISPUTE_VIEWS.map((v) => v.label), ['Needs a ruling', 'Waiting on a party']);
  const rows = [
    dispute({ jobId: 'both', statements: { buyer: said, seller: said } }),
    dispute({ jobId: 'one', statements: { buyer: said } }),
    dispute({ jobId: 'judged', statements: { buyer: said }, proposal: { sellerBps: 0, confidence: 'high', items: [], status: 'proposed' } as unknown as AdminDisputeRow['proposal'] }),
  ];
  assert.deepEqual(disputeList(rows, 'ruling').map((d) => d.jobId), ['both', 'judged']);
  assert.deepEqual(disputeList(rows, 'waiting').map((d) => d.jobId), ['one']);
});
