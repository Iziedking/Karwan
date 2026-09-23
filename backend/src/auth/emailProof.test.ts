import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET = 'email-proof-test-session-secret-value';
const { EMAIL_PROOF_TTL_MS, signEmailProof, verifyEmailProof } = await import('./emailProof.js');
const { signSession, verifySession } = await import('./session.js');
const { decideLink } = await import('../db/modularAccounts.js');

const secret = 'test-secret-that-is-long-enough-for-hmac';
const t0 = 1_800_000_000_000;

test('a fresh proof returns the normalised email', () => {
  const token = signEmailProof(' Ada@Example.com ', t0, secret);
  assert.equal(verifyEmailProof(token, t0 + 1000, secret), 'ada@example.com');
});

test('an expired, altered or foreign-key proof is refused', () => {
  const token = signEmailProof('ada@example.com', t0, secret);
  assert.equal(verifyEmailProof(token, t0 + EMAIL_PROOF_TTL_MS + 1, secret), null);
  assert.equal(verifyEmailProof(token, t0, 'another-secret-another-secret-xx'), null);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'eve@example.com', exp: t0 + 60_000 })).toString('base64url');
  assert.equal(verifyEmailProof(`${forged}.${sig}`, t0, secret), null);
  assert.equal(verifyEmailProof(`${body}.`, t0, secret), null);
});

test('an email proof never verifies as a session', () => {
  const token = signEmailProof('ada@example.com');
  assert.equal(verifySession(token), null);
  assert.equal(verifyEmailProof(signSession({ address: '0x1', method: 'web3' })), null);
});

test('one email per account, one account per email', () => {
  const a = { address: '0xa', email: 'ada@example.com', createdAt: 1 };
  assert.deepEqual(decideLink('0xa', 'ada@example.com', null, null), { kind: 'create' });
  assert.deepEqual(decideLink('0xa', 'ada@example.com', a, a), { kind: 'exists' });
  assert.deepEqual(decideLink('0xa', 'bob@example.com', a, null), { kind: 'conflict', reason: 'address_has_email' });
  assert.deepEqual(decideLink('0xb', 'ada@example.com', null, a), { kind: 'conflict', reason: 'email_in_use' });
});
