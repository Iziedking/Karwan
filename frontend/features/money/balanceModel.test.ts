import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAmount, formatBalance, heroAmount, homeState, movingTransfer } from './balanceModel';

const facts = { balance: null as number | null, pool: 0, loading: false, error: false };

test('the home says loading, error, empty or ready from the balance', () => {
  assert.equal(homeState({ ...facts, loading: true }), 'loading');
  assert.equal(homeState({ ...facts, error: true }), 'error');
  assert.equal(homeState({ ...facts, loading: true, error: true }), 'loading');
  assert.equal(homeState({ ...facts, balance: 0 }), 'empty');
  assert.equal(homeState({ ...facts, balance: 0, pool: 5 }), 'ready');
  assert.equal(homeState({ ...facts, balance: 12.5 }), 'ready');
});

test('the one number is the Arc balance plus a Gateway balance already held', () => {
  assert.equal(heroAmount({ ...facts, balance: 1240.5, pool: 20 }), 1260.5);
  assert.equal(heroAmount({ ...facts }), 0);
});

test('the moving line picks the newest transfer still in flight', () => {
  const records = [
    { phase: 'done' as const, amountUsdc: '10', sourceChainKey: 'baseSepolia', startedAt: 5 },
    { phase: 'burning' as const, direction: 'out' as const, amountUsdc: '3', sourceChainKey: 'arc', startedAt: 4 },
    { phase: 'attesting' as const, direction: 'out' as const, amountUsdc: '50', sourceChainKey: 'baseSepolia', startedAt: 3 },
    { phase: 'approving' as const, amountUsdc: '9', sourceChainKey: 'sepolia', startedAt: 2 },
  ];
  assert.equal(movingTransfer(records, 10)?.amountUsdc, '50');
  assert.equal(movingTransfer([{ phase: 'error' as const, amountUsdc: '1', sourceChainKey: 'sepolia', startedAt: 1 }], 10), null);
});

test('a balance is shown to the cent, rounded down, in the reader\'s locale', () => {
  assert.equal(formatBalance(0.29, 'en'), '0.29');
  assert.equal(formatBalance(1240.509, 'en'), '1,240.50');
  assert.equal(formatBalance(0, 'en'), '0.00');
  assert.equal(formatBalance(1240.5, 'fr'), '1 240,50');
});

test('an amount being moved is shown exactly', () => {
  assert.equal(formatAmount(120, 'en'), '120.00');
  assert.equal(formatAmount(12.345678, 'en'), '12.345678');
  assert.equal(formatAmount(1240.5, 'en'), '1,240.50');
});

test('a transfer stuck for more than an hour does not claim the balance line', () => {
  const now = 10 * 60 * 60_000;
  const old = { phase: 'attesting' as const, amountUsdc: '50', sourceChainKey: 'baseSepolia', startedAt: now - 2 * 60 * 60_000 };
  const fresh = { phase: 'attesting' as const, amountUsdc: '9', sourceChainKey: 'baseSepolia', startedAt: now - 60_000 };
  assert.equal(movingTransfer([old], now), null);
  assert.equal(movingTransfer([old, fresh], now)?.amountUsdc, '9');
});
