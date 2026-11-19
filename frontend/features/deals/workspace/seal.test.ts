import assert from 'node:assert/strict';
import test from 'node:test';
import type { DealView } from '@/core/api';
import { sealFor } from './seal';

function view(over: Partial<DealView> = {}): DealView {
  return {
    stage: 'awaiting-delivery',
    money: { line: 'held' },
    progress: [],
    next: { action: 'deliver', actor: 'counterparty', amountUsdc: null },
    automatic: null,
    hold: null,
    ...over,
  } as DealView;
}

test('your move wins over held', () => {
  assert.equal(sealFor(view({ next: { action: 'release', actor: 'you', amountUsdc: '100' } })), 'turn');
});

test('held money with nothing to do reads Held', () => {
  assert.equal(sealFor(view()), 'held');
  assert.equal(sealFor(view({ money: { line: 'paused' } })), 'held');
});

test('a released or refunded deal has no seal', () => {
  assert.equal(sealFor(view({ stage: 'settled', money: { line: 'released' }, next: { action: null, actor: 'nobody', amountUsdc: null } })), null);
  assert.equal(sealFor(view({ stage: 'cancelled', money: { line: 'refunded' }, next: { action: null, actor: 'nobody', amountUsdc: null } })), null);
  assert.equal(sealFor(view({ stage: 'awaiting-funding', money: { line: 'not-funded' }, next: { action: 'fund', actor: 'counterparty', amountUsdc: '100' } })), null);
});

test('a finished deal never says your turn', () => {
  assert.equal(sealFor(view({ stage: 'settled', money: { line: 'released' }, next: { action: 'dispute', actor: 'you', amountUsdc: null } })), null);
});
