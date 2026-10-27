import assert from 'node:assert/strict';
import test from 'node:test';
import { FEE_MARGIN, MIN_SECONDS_LEFT, orderCalls, recordFits, type OwnCall, type RecordStep } from './ownWalletPlan';

const USDC = '0x3600000000000000000000000000000000000000' as const;
const REGISTRY = `0x${'5e'.repeat(20)}` as const;
const transfer: OwnCall = { to: USDC, data: '0xa9059cbb' };
const steps: RecordStep[] = [
  { name: 'register', to: REGISTRY, data: '0x1aa3a008' },
  { name: 'bindBuyer', to: REGISTRY, data: '0x01' },
  { name: 'bindSeller', to: REGISTRY, data: '0x02' },
];
const fits = (over: Partial<Parameters<typeof recordFits>[0]> = {}) =>
  recordFits({ steps, spendsWholeBalance: false, balanceAfterMicros: 10_000n, extraFeeMicros: 5_000n, validUntil: 1_000, nowSecs: 0, ...over });

test('person_calls_first_then_record_steps', () => {
  const out = orderCalls([transfer], steps);
  assert.deepEqual(out.map((c) => [c.target, c.callData, c.allowFailure]), [
    [USDC, '0xa9059cbb', false],
    [REGISTRY, '0x1aa3a008', true],
    [REGISTRY, '0x01', true],
    [REGISTRY, '0x02', true],
  ]);
});

test('register_first_when_a_call_needs_the_record', () => {
  const out = orderCalls([{ ...transfer, needsRecord: true }], steps);
  assert.deepEqual(out.map((c) => [c.callData, c.allowFailure]), [
    ['0x1aa3a008', false],
    ['0xa9059cbb', false],
    ['0x01', true],
    ['0x02', true],
  ]);
});

test('record_alone_keeps_register_must_succeed', () => {
  assert.deepEqual(orderCalls([], steps).map((c) => c.allowFailure), [false, true, true]);
  assert.deepEqual(orderCalls([], steps.slice(1)).map((c) => c.allowFailure), [true, true], 'binds alone may each fail');
});

test('nothing_to_add_when_no_steps', () => {
  assert.deepEqual(orderCalls([transfer], []), [{ target: USDC, allowFailure: false, callData: '0xa9059cbb' }]);
  assert.equal(fits({ steps: [] }), false);
});

test('plan_rides_along_at_twice_the_fee', () => {
  assert.equal(FEE_MARGIN, 2n);
  assert.equal(fits({ balanceAfterMicros: 10_000n, extraFeeMicros: 5_000n }), true);
});

test('plan_goes_alone_when_fee_margin_missing', () => {
  assert.equal(fits({ balanceAfterMicros: 9_500n, extraFeeMicros: 5_000n }), false);
  assert.equal(fits({ balanceAfterMicros: -1n, extraFeeMicros: 5_000n }), false);
});

test('plan_goes_alone_for_whole_balance', () => {
  assert.equal(fits({ spendsWholeBalance: true, balanceAfterMicros: 1_000_000n }), false);
});

test('plan_goes_alone_when_deadline_near', () => {
  assert.equal(MIN_SECONDS_LEFT, 120);
  assert.equal(fits({ validUntil: 1_119, nowSecs: 1_000 }), false);
  assert.equal(fits({ validUntil: 1_120, nowSecs: 1_000 }), true);
});
