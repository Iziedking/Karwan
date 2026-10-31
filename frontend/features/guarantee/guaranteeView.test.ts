import assert from 'node:assert/strict';
import test from 'node:test';
import { guaranteeView } from './guaranteeView';

/// The deal guarantee as a money page (view 44, P13).
///
///   npx tsx --test features/guarantee/guaranteeView.test.ts

const on = (over: Record<string, unknown> = {}) => ({
  available: true as const, hasRecord: true, inPlaceUsdc: '200', heldUsdc: '50', freeUsdc: '150', comingBackUsdc: '0', readyAt: null, ready: false, previousUsdc: '0', waitDays: 7, ...over,
});

test('the guarantee reads as its amount, then what is held, free and coming back', () => {
  assert.equal(guaranteeView(undefined), null);
  assert.deepEqual(guaranteeView({ available: false }), { kind: 'off' });
  assert.deepEqual(guaranteeView(on()), { kind: 'on', guaranteed: '200', held: '50', free: '150', comingBack: null });
  assert.deepEqual(guaranteeView(on({ comingBackUsdc: '30', readyAt: 1_800_000_000 })), { kind: 'on', guaranteed: '200', held: '50', free: '150', comingBack: { amount: '30', at: 1_800_000_000 } });
});
