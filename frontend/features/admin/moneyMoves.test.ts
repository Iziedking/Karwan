import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminMoneyMove } from '@/core/api';
import { MOVE_VIEWS, movesShown } from './moneyMoves';

function row(over: Partial<AdminMoneyMove>): AdminMoneyMove {
  return { reference: 'KWN-AAAA', what: 'Withdraw', who: '@chidi', amountUsdc: '52.1', route: 'Arc → outside', since: 0, status: 'stuck', statusLabel: 'Late', txHashes: [], ...over };
}

const rows = [
  row({ reference: 'KWN-ONE', who: '@chidi', status: 'stuck', txHashes: ['0xabc123'] }),
  row({ reference: 'KWN-TWO', who: '@ada', status: 'moving', amountUsdc: '10' }),
  row({ reference: 'KWN-THREE', who: '@fatou', status: 'failed' }),
  row({ reference: 'KWN-FOUR', who: '@wanjiru', status: 'done' }),
];

test('the chips are Stuck, Moving, Did not go through and Done today', () => {
  assert.deepEqual(MOVE_VIEWS.map((v) => v.label), ['Stuck', 'Moving', 'Did not go through', 'Done today']);
});

test('a chip shows its own rows', () => {
  assert.deepEqual(movesShown(rows, 'stuck', '').map((r) => r.reference), ['KWN-ONE']);
  assert.deepEqual(movesShown(rows, 'failed', '').map((r) => r.reference), ['KWN-THREE']);
});

test('search runs across every chip by tag, amount, reference or transaction', () => {
  assert.deepEqual(movesShown(rows, 'stuck', '@ada').map((r) => r.reference), ['KWN-TWO']);
  assert.deepEqual(movesShown(rows, 'stuck', 'ada').map((r) => r.reference), ['KWN-TWO']);
  assert.deepEqual(movesShown(rows, 'done', '10').map((r) => r.reference), ['KWN-TWO']);
  assert.deepEqual(movesShown(rows, 'done', 'kwn-three').map((r) => r.reference), ['KWN-THREE']);
  assert.deepEqual(movesShown(rows, 'done', '0xABC1').map((r) => r.reference), ['KWN-ONE']);
});
