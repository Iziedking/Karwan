import test from 'node:test';
import assert from 'node:assert/strict';
import { canAskForFix, caseFromAddress, channelLabel, dueLabel, kindLabel, stateLabel } from './supportDesk';

const NOW = Date.parse('2026-11-12T10:00:00+01:00');
const MIN = 60_000;

test('due later is calm', () => {
  assert.deepEqual(dueLabel(NOW + 80 * MIN, NOW), { text: 'Due in 1 h 20 min', tone: 'calm' });
});

test('due within half an hour is soon', () => {
  assert.deepEqual(dueLabel(NOW + 25 * MIN, NOW), { text: 'Due in 25 min', tone: 'soon' });
});

test('past due is late', () => {
  assert.deepEqual(dueLabel(NOW - 15 * MIN, NOW), { text: 'Late by 15 min', tone: 'late' });
  assert.deepEqual(dueLabel(NOW - 130 * MIN, NOW), { text: 'Late by 2 h 10 min', tone: 'late' });
});

test('answered once a teammate replied', () => {
  assert.deepEqual(dueLabel(NOW - 15 * MIN, NOW, NOW - 30 * MIN), { text: 'Answered', tone: 'calm' });
});

test('kinds, states and channels read in plain words', () => {
  assert.equal(kindLabel('money_in_deal'), 'Money held in a deal');
  assert.equal(kindLabel('transfer_missing'), 'Transfer did not arrive');
  assert.equal(kindLabel('account'), 'Account and sign-in');
  assert.equal(kindLabel('using_karwan'), 'Using Karwan');
  assert.equal(kindLabel('other'), 'Something else');
  assert.equal(stateLabel('new'), 'New');
  assert.equal(stateLabel('waiting_us'), 'Waiting on us');
  assert.equal(stateLabel('waiting_person'), 'Waiting on them');
  assert.equal(stateLabel('solved'), 'Solved');
  assert.equal(channelLabel('web'), 'Website');
  assert.equal(channelLabel('telegram'), 'Telegram');
  assert.equal(channelLabel('email'), 'Email');
});

test('asking for a fix shows only to a teammate with fix on Deals; the owner always', () => {
  assert.equal(canAskForFix({ owner: false, access: { support: 'fix' } }), false);
  assert.equal(canAskForFix({ owner: false, access: { support: 'change', deals: 'change' } }), false);
  assert.equal(canAskForFix({ owner: false, access: { support: 'change', deals: 'fix' } }), true);
  assert.equal(canAskForFix({ owner: true, access: {} }), true);
});

test('a case reference in the address opens that case; anything else opens the queue', () => {
  assert.equal(caseFromAddress('?case=KS-1042'), 'KS-1042');
  assert.equal(caseFromAddress('?case=<script>'), null);
  assert.equal(caseFromAddress(''), null);
});
