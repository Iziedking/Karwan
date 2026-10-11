import assert from 'node:assert/strict';
import test from 'node:test';
import { refusalBody } from './refusal.js';

test('every refusal has a code the web maps and one plain sentence for chat', () => {
  const codes = ['NO_SESSION', 'PAUSED', 'RETURN_CHECK', 'ADDRESS_NOT_SAVED', 'OWN_WALLET_ONLY'] as const;
  for (const code of codes) {
    const body = refusalBody({ code });
    assert.equal(body.code, `MONEY_OUT_${code}`);
    assert.ok(body.error.length > 10);
    assert.ok(!body.error.includes('—'));
  }
});

test('a waiting address says when it opens', () => {
  const opensAt = Date.UTC(2026, 9, 13, 14, 5);
  assert.deepEqual(refusalBody({ code: 'ADDRESS_OPENS_LATER', opensAt }), {
    code: 'MONEY_OUT_ADDRESS_OPENS_LATER',
    error: 'This address can receive money from 13 Oct, 14:05 UTC.',
    opensAt,
  });
});

test('the limit says what is left and when more opens', () => {
  const moreAt = Date.UTC(2026, 9, 13, 9, 0);
  assert.deepEqual(refusalBody({ code: 'DAILY_LIMIT', leftMicros: 50_250_000n, moreAt }), {
    code: 'MONEY_OUT_DAILY_LIMIT',
    error: 'Up to 500 USDC can leave your account in 24 hours. 50.25 USDC can leave now, and more from 13 Oct, 09:00 UTC.',
    limitUsdc: '500',
    leftUsdc: '50.25',
    moreAt,
  });
});
