import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32, checkCode, newCodeSecret, openSecret, otpauthUri, sealSecret, totp } from './deskCode.js';

// RFC 6238, appendix B, SHA-1 seed, reduced to 6 digits.
const RFC_SECRET = Buffer.from('12345678901234567890');
const step = (seconds: number) => Math.floor(seconds / 30);

test('the RFC 6238 SHA-1 vectors, as 6 digits', () => {
  assert.equal(totp(RFC_SECRET, step(59)), '287082');
  assert.equal(totp(RFC_SECRET, step(1111111109)), '081804');
  assert.equal(totp(RFC_SECRET, step(1111111111)), '050471');
  assert.equal(totp(RFC_SECRET, step(1234567890)), '005924');
  assert.equal(totp(RFC_SECRET, step(2000000000)), '279037');
});

test('a code from the step before or after is taken; two steps away is wrong', () => {
  const now = 1234567890 * 1000;
  const s = step(1234567890);
  assert.deepEqual(checkCode(RFC_SECRET, totp(RFC_SECRET, s - 1), now), { ok: true, step: s - 1 });
  assert.deepEqual(checkCode(RFC_SECRET, totp(RFC_SECRET, s + 1), now), { ok: true, step: s + 1 });
  assert.deepEqual(checkCode(RFC_SECRET, totp(RFC_SECRET, s + 2), now), { ok: false, reason: 'wrong' });
  assert.deepEqual(checkCode(RFC_SECRET, '12345', now), { ok: false, reason: 'wrong' });
});

test('a code already used is refused as reused, not wrong', () => {
  const now = 1234567890 * 1000;
  const s = step(1234567890);
  assert.deepEqual(checkCode(RFC_SECRET, totp(RFC_SECRET, s), now, s), { ok: false, reason: 'reused' });
  assert.deepEqual(checkCode(RFC_SECRET, totp(RFC_SECRET, s - 1), now, s), { ok: false, reason: 'reused' });
});

test('the link an authenticator app reads', () => {
  const s = newCodeSecret();
  assert.equal(s.length, 20);
  const uri = otpauthUri('tobi@x.com', s);
  assert.ok(uri.startsWith('otpauth://totp/Karwan%20Desk:tobi%40x.com?secret='), uri);
  assert.ok(uri.includes(`secret=${base32(s)}`));
  assert.ok(uri.includes('issuer=Karwan%20Desk'));
  assert.equal(base32(Buffer.from('foobar')), 'MZXW6YTBOI');
});

test('a sealed secret opens with its key and not with another', () => {
  const s = newCodeSecret();
  const sealed = sealSecret(s, 'key-one');
  assert.ok(!sealed.includes(base32(s)));
  assert.deepEqual(openSecret(sealed, 'key-one'), s);
  assert.throws(() => openSecret(sealed, 'key-two'));
});
