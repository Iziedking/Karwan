import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminMoneyRequest } from '@/core/api';
import { waitingCard, waitingTab, waitingTabs } from './waitingPresentation';

const at = Date.UTC(2026, 10, 12, 13, 31);

function request(over: Partial<AdminMoneyRequest> = {}): AdminMoneyRequest {
  return {
    id: 'r1',
    action: 'release',
    label: 'Pay the next milestone to the seller',
    method: 'POST',
    path: '/api/admin/deals/0x7b2e00000000000000000000000000000000091c4/release',
    query: '',
    body: {},
    reason: 'KS-1036: Buyer confirmed delivery by message but could not sign in.',
    requestedBy: { memberId: 'tobi', email: 'tobi@karwan.site', name: 'Tobi Martins' },
    requestedAt: at,
    expiresAt: at + 24 * 3_600_000,
    snapshot: null,
    status: 'pending',
    ...over,
  };
}

test('each kind of move has a plain label', () => {
  const kind = (action: string) => waitingCard(request({ action }), 'me', at).kindLabel;
  assert.equal(kind('payout-retry'), 'Payout retry');
  assert.equal(kind('release'), 'Release');
  assert.equal(kind('resolve'), 'Rule a dispute');
  assert.equal(kind('usyc-run'), 'Treasury move');
  assert.equal(kind('usyc-cover'), 'Treasury move');
  assert.equal(kind('attestation-sweep'), 'Chain write');
  assert.equal(kind('reputation-backfill'), 'Chain write');
  assert.equal(kind('force-cancel'), 'Close a deal');
  assert.equal(kind('something-new'), 'Money move');
});

test('the card names who asked, when, the case and the deal, and the reason without the case', () => {
  const card = waitingCard(request(), 'me', at + 60_000);
  assert.equal(card.title, 'Pay the next milestone to the seller');
  assert.equal(card.askedBy, 'Asked by Tobi Martins · 14:31');
  assert.equal(card.line, 'Buyer confirmed delivery by message but could not sign in.');
  assert.equal(card.caseRef, 'KS-1036');
  assert.equal(card.ref, 'KS-1036 · deal 0x7b2e…91c4');
  assert.equal(card.amountUsdc, null);
});

test('an amount shows only when the request carries one', () => {
  assert.equal(waitingCard(request({ body: { amountUsdc: '52.1' } }), 'me', at).amountUsdc, '52.1');
  assert.equal(waitingCard(request({ body: { amount: 'lots' } }), 'me', at).amountUsdc, null);
});

test('you cannot approve what you asked for', () => {
  const mine = waitingCard(request(), 'tobi', at);
  assert.equal(mine.canApprove, false);
  assert.equal(mine.note, 'You asked for this. Someone else approves it.');
  const theirs = waitingCard(request(), 'kemi', at);
  assert.equal(theirs.canApprove, true);
  assert.equal(theirs.note, null);
});

test('an older request reads the day as well', () => {
  assert.equal(waitingCard(request({ requestedAt: at - 24 * 3_600_000 }), 'me', at).askedBy, 'Asked by Tobi Martins · 11 Nov 14:31');
});

test('tabs are Waiting, Approved and Turned down, with counts', () => {
  const rows = [
    request({ id: 'a' }),
    request({ id: 'b' }),
    request({ id: 'c', status: 'done' }),
    request({ id: 'd', status: 'failed' }),
    request({ id: 'e', status: 'turned_down' }),
    request({ id: 'f', status: 'cancelled' }),
    request({ id: 'g', status: 'expired' }),
    request({ id: 'h', status: 'refused' }),
  ];
  assert.deepEqual(waitingTabs(rows), [
    { key: 'waiting', label: 'Waiting', count: 2 },
    { key: 'approved', label: 'Approved', count: 2 },
    { key: 'turned_down', label: 'Turned down', count: 4 },
  ]);
  assert.equal(waitingTab(request({ status: 'running' })), 'approved');
  assert.equal(waitingTab(request({ status: 'refused' })), 'turned_down');
});

test('a decided card says how it ended', () => {
  const decided = (over: Partial<AdminMoneyRequest>) => waitingCard(request(over), 'me', at).outcome;
  assert.equal(decided({ status: 'done', approvedBy: { memberId: 'k', email: null, name: 'Kemi Eze' } }), 'Approved by Kemi Eze. Done.');
  assert.equal(decided({ status: 'failed', approvedBy: { memberId: 'k', email: null, name: 'Kemi Eze' } }), 'Approved by Kemi Eze. It did not go through.');
  assert.equal(decided({ status: 'turned_down', turnedDownBy: { memberId: 'k', email: null, name: 'Kemi Eze' } }), 'Turned down by Kemi Eze.');
  assert.equal(decided({ status: 'cancelled' }), 'Withdrawn by Tobi Martins.');
  assert.equal(decided({ status: 'expired' }), 'Nobody approved it within 24 hours.');
  assert.equal(decided({ status: 'refused' }), 'Refused: the deal changed after it was asked for.');
  assert.equal(decided({ status: 'pending' }), null);
});
