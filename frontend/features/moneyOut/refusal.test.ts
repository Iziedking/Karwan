import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/core/api';
import { moneyOutRefusalOf, nextStepFor } from './refusal';

const refused = (body: Record<string, unknown>, status = 409) =>
  new ApiError(status, String(body.error ?? ''), undefined, body.code as string | undefined, body);

test('a guard answer is read from the 409 the backend sends', () => {
  assert.deepEqual(moneyOutRefusalOf(refused({ code: 'MONEY_OUT_ADDRESS_NOT_SAVED', error: 'Add this address' })), {
    code: 'ADDRESS_NOT_SAVED',
  });
  assert.deepEqual(
    moneyOutRefusalOf(refused({ code: 'MONEY_OUT_DAILY_LIMIT', error: 'x', leftUsdc: '50.25', moreAt: 1_800_000_000_000 })),
    { code: 'DAILY_LIMIT', leftUsdc: '50.25', moreAt: 1_800_000_000_000 },
  );
  assert.deepEqual(moneyOutRefusalOf(refused({ code: 'MONEY_OUT_ADDRESS_OPENS_LATER', error: 'x', opensAt: 7 })), {
    code: 'ADDRESS_OPENS_LATER',
    opensAt: 7,
  });
});

test('anything else is not a guard answer', () => {
  assert.equal(moneyOutRefusalOf(refused({ code: 'INSUFFICIENT_BALANCE', error: 'x' })), null);
  assert.equal(moneyOutRefusalOf(refused({ code: 'MONEY_OUT_SOMETHING_NEW', error: 'x' })), null);
  assert.equal(moneyOutRefusalOf(refused({ code: 'MONEY_OUT_PAUSED', error: 'x' }, 500)), null);
  assert.equal(moneyOutRefusalOf(new Error('offline')), null);
});

test('each answer has one next step', () => {
  assert.deepEqual(nextStepFor({ code: 'ADDRESS_NOT_SAVED' }), { kind: 'check', purpose: 'add_address' });
  assert.deepEqual(nextStepFor({ code: 'RETURN_CHECK' }), { kind: 'check', purpose: 'return' });
  assert.deepEqual(nextStepFor({ code: 'PAUSED' }), { kind: 'check', purpose: 'unpause' });
  assert.deepEqual(nextStepFor({ code: 'NO_SESSION' }), { kind: 'link', href: '/verify/person' });
  for (const code of ['ADDRESS_OPENS_LATER', 'DAILY_LIMIT', 'OWN_WALLET_ONLY'] as const) {
    assert.deepEqual(nextStepFor({ code }), { kind: 'none' }, code);
  }
});

test('each answer reads as one plain sentence with its numbers filled in', async () => {
  const { refusalLine } = await import('./refusal');
  const { moneyOutCopy } = await import('@/shared/i18n/messages/moneyOut');
  const copy = moneyOutCopy.en;
  const at = Date.UTC(2026, 9, 13, 14, 5);
  assert.equal(refusalLine({ code: 'ADDRESS_NOT_SAVED' }, copy, 'en'), copy.notSaved);
  const later = refusalLine({ code: 'ADDRESS_OPENS_LATER', opensAt: at }, copy, 'en');
  assert.match(later, /^This address can receive money from .*Oct/);
  const limit = refusalLine({ code: 'DAILY_LIMIT', limitUsdc: '500', leftUsdc: '50.25', moreAt: at }, copy, 'en');
  assert.match(limit, /^Up to 500 USDC can leave your account in 24 hours\. 50\.25 USDC can leave now, and more from .*Oct/);
  for (const line of [later, limit]) assert.ok(!line.includes('{'), line);
});
