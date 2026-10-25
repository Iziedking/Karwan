import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCancelTakeOutConfirm, buildCollectConfirm, buildTakeOutConfirm, positionsToTakeOut, type InsurancePosition } from './insurance.js';

const ME = `0x${'a'.repeat(40)}`;
const NOW = Date.UTC(2026, 9, 24, 12) / 1000;
const pos = (positionId: string, amountUsdc: number, state = 1, claimableAt = 0): InsurancePosition => ({ positionId, amountUsdc, state, claimableAt });

test('the positions chosen match the page: exact, then the smallest that covers, then newest first', () => {
  const active = [pos('1', 50), pos('2', 20), pos('3', 30)];
  assert.deepEqual(positionsToTakeOut(active, 20).map((p) => p.positionId), ['2']);
  assert.deepEqual(positionsToTakeOut(active, 25).map((p) => p.positionId), ['3']);
  assert.deepEqual(positionsToTakeOut(active, 70).map((p) => p.positionId), ['3', '2', '1']);
});

test('taking out shows the amount, the wait and the day it can be collected', () => {
  const card = buildTakeOutConfirm({ address: ME, positions: [pos('1', 50), pos('2', 20)], freeUsdc: 70, reservedUsdc: 0, amountUsdc: 20, waitDays: 7, nowUnix: NOW, signer: 'karwan' });
  assert.ok(!('error' in card));
  assert.equal(card.intent, 'insurance_take_out');
  assert.deepEqual(card.payload.positionIds, ['2']);
  assert.equal(card.payload.amountUsdc, '20.00');
  assert.deepEqual(card.fields.map((f) => f.value), ['20.00 USDC', '7 days', '31 Oct']);
  assert.match(card.warning!, /no longer protects your deals/);
});

test('when whole positions overshoot the ask, the card says what actually starts the wait', () => {
  const card = buildTakeOutConfirm({ address: ME, positions: [pos('1', 50)], freeUsdc: 50, reservedUsdc: 0, amountUsdc: 20, waitDays: 7, nowUnix: NOW, signer: 'wallet' });
  assert.ok(!('error' in card));
  assert.equal(card.payload.amountUsdc, '50.00');
  assert.equal(card.payload.signer, 'wallet');
  assert.ok(card.fields.some((f) => f.label === 'You asked for' && f.value === '20.00 USDC'));
  assert.match(card.warning!, /50\.00 USDC starts the wait/);
});

test('no amount takes out everything that is free', () => {
  const card = buildTakeOutConfirm({ address: ME, positions: [pos('1', 30), pos('2', 20)], freeUsdc: 50, reservedUsdc: 0, waitDays: 7, nowUnix: NOW, signer: 'karwan' });
  assert.ok(!('error' in card));
  assert.equal(card.payload.amountUsdc, '50.00');
});

test('taking out refuses plainly: nothing put up, all of it protecting deals, or more than is free', () => {
  const base = { address: ME, waitDays: 7, nowUnix: NOW, signer: 'karwan' as const };
  assert.match((buildTakeOutConfirm({ ...base, positions: [], freeUsdc: 0, reservedUsdc: 0 }) as { error: string }).error, /no deal insurance/);
  assert.match((buildTakeOutConfirm({ ...base, positions: [pos('1', 40)], freeUsdc: 0, reservedUsdc: 40 }) as { error: string }).error, /protects open deals/);
  assert.match((buildTakeOutConfirm({ ...base, positions: [pos('1', 40)], freeUsdc: 25, reservedUsdc: 15, amountUsdc: 30 }) as { error: string }).error, /Only 25\.00 USDC.*15\.00 USDC protects open deals/);
});

test('cancelling covers every waiting position, and refuses when nothing waits', () => {
  const card = buildCancelTakeOutConfirm({ address: ME, positions: [pos('1', 10, 2, NOW + 100), pos('2', 5, 2, NOW - 100), pos('3', 9)], signer: 'karwan' });
  assert.ok(!('error' in card));
  assert.deepEqual(card.payload.positionIds, ['1', '2']);
  assert.equal(card.payload.amountUsdc, '15.00');
  assert.match((buildCancelTakeOutConfirm({ address: ME, positions: [pos('3', 9)], signer: 'karwan' }) as { error: string }).error, /None of their deal insurance is waiting/);
});

test('collecting takes only what has finished waiting, and says when the rest is ready', () => {
  const card = buildCollectConfirm({ address: ME, positions: [pos('1', 10, 2, NOW - 1), pos('2', 5, 2, NOW + 86_400)], nowUnix: NOW, signer: 'karwan' });
  assert.ok(!('error' in card));
  assert.deepEqual(card.payload.positionIds, ['1']);
  assert.equal(card.payload.amountUsdc, '10.00');
  const early = buildCollectConfirm({ address: ME, positions: [pos('2', 5, 2, NOW + 86_400)], nowUnix: NOW, signer: 'karwan' });
  assert.match((early as { error: string }).error, /can be collected on 25 Oct/);
  assert.match((buildCollectConfirm({ address: ME, positions: [pos('3', 9)], nowUnix: NOW, signer: 'karwan' }) as { error: string }).error, /nothing to collect/);
});
