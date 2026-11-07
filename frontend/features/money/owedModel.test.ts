import assert from 'node:assert/strict';
import test from 'node:test';
import { owedOutcome, owedView } from './owedModel';

const karwan = { id: 'agreement:0xbb', amountUsdc: '40', signs: 'karwan' as const, from: 'deal' as const };
const yours = { id: 'cre:0xaa', amountUsdc: '0.25', signs: 'you' as const, from: 'check' as const };

test('nothing owed shows nothing', () => {
  assert.equal(owedView(null), null);
  assert.equal(owedView({ totalUsdc: '0', unreadable: false, lines: [] }), null);
});

test('the row shows the total and splits what Karwan collects from what the wallet signs', () => {
  assert.deepEqual(owedView({ totalUsdc: '40.25', unreadable: true, lines: [karwan, yours] }), {
    totalUsdc: 40.25,
    karwanIds: [karwan.id],
    walletIds: [yours.id],
    unreadable: true,
  });
});

test('an unreadable part with nothing else owed still shows, so the person knows to look again', () => {
  assert.deepEqual(owedView({ totalUsdc: '0', unreadable: true, lines: [] }), { totalUsdc: 0, karwanIds: [], walletIds: [], unreadable: true });
});

test('the outcome is done only when every line was collected', () => {
  assert.equal(owedOutcome({ asked: 2, collected: 2 }), 'done');
  assert.equal(owedOutcome({ asked: 2, collected: 1 }), 'partly');
  assert.equal(owedOutcome({ asked: 2, collected: 0 }), 'failed');
});
