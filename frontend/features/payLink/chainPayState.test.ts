import test from 'node:test';
import assert from 'node:assert/strict';
import type { DepositRequestPublic } from '@/core/api';
import { chainPayState, afterPaid } from './chainPayState';

const base: DepositRequestPublic = {
  requestId: 't',
  recipientAddress: '0xabc',
  amountUsdc: '120',
  purpose: 'Logo',
  expiresAt: 9e15,
  status: 'open',
  createdAt: 1,
  acceptedChains: [],
};

test('nothing sent yet is waiting', () => {
  assert.deepEqual(chainPayState(base), { phase: 'waiting', sendUsdc: '120' });
});

test('part of the amount asks for the rest to the same address', () => {
  const s = chainPayState({ ...base, receivedUsdc: '100', remainingUsdc: '20', payments: [{ amountUsdc: '100', chain: 'Base', at: 2, delivery: 'moving' }] });
  assert.deepEqual(s, { phase: 'part', got: '100', total: '120', sendUsdc: '20', chain: 'Base', delivery: 'moving' });
});

test('paid in full follows the last payment to Arc', () => {
  const moving = chainPayState({ ...base, status: 'matched', receivedUsdc: '120', remainingUsdc: '0', payments: [{ amountUsdc: '120', chain: 'Base', at: 2, delivery: 'moving' }] });
  assert.equal(moving.phase, 'moving');
  const done = chainPayState({ ...base, status: 'matched', receivedUsdc: '120', remainingUsdc: '0', payments: [{ amountUsdc: '120', chain: 'Base', at: 2, delivery: 'delivered' }] });
  assert.equal(done.phase, 'delivered');
  const late = chainPayState({ ...base, status: 'matched', receivedUsdc: '120', remainingUsdc: '0', payments: [{ amountUsdc: '120', chain: 'Solana', at: 2, delivery: 'delayed' }] });
  assert.deepEqual(late, { phase: 'delayed', chain: 'Solana' });
});

test('after paying, a member goes home and anyone else is offered an account', () => {
  assert.deepEqual(afterPaid(true), { kind: 'home', href: '/app' });
  assert.deepEqual(afterPaid(false), { kind: 'join' });
});
