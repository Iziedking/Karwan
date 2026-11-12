import test from 'node:test';
import assert from 'node:assert/strict';
import { channelLabel, dueLabel, kindLabel, stateLabel } from './supportDesk';

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
