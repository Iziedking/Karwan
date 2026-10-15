import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';

const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
process.env.ATTESTATION_ISSUER_PRIVATE_KEY = TEST_KEY;
delete process.env.ATTESTATION_ISSUER_ADDRESS;

const { signRecordRead, verifyRecordRead, recordReadHash } = await import('./recordReadSignature.js');
const { resetIssuerCache } = await import('../attestation/issuer.js');
resetIssuerCache();

const issuer = privateKeyToAccount(TEST_KEY).address;

const body = {
  version: 'karwan-record-v1' as const,
  issuer: issuer.toLowerCase(),
  subject: { tag: 'ada', address: '0x00000000000000000000000000000000000000aa' },
  level: 'work_verified' as const,
  score: 82,
  tier: 'STRONG',
  counts: { completed: 12, onTimeRate: 92, disputesWon: 0, disputesLost: 0, cancelled: 0 },
  outcomes: [],
  issuedAt: 1_000,
  expiresAt: 1_000 + 86_400_000,
};

test('a signed read verifies against the issuer while fresh', async () => {
  const doc = await signRecordRead(body, 5042002);
  assert.ok(doc);
  assert.equal(await verifyRecordRead(doc!, issuer, 2_000), true);
});

test('tampered, expired or wrong-issuer reads fail', async () => {
  const doc = (await signRecordRead(body, 5042002))!;
  assert.equal(await verifyRecordRead({ ...doc, score: 99 }, issuer, 2_000), false);
  assert.equal(await verifyRecordRead({ ...doc, counts: { ...doc.counts, disputesLost: 3 } }, issuer, 2_000), false);
  assert.equal(await verifyRecordRead(doc, issuer, doc.expiresAt + 1), false);
  assert.equal(await verifyRecordRead(doc, '0x00000000000000000000000000000000000000ff', 2_000), false);
});

test('hash covers outcomes in order', () => {
  const a = recordReadHash({ ...body, outcomes: [{ endedAt: 1, success: true, onTime: true, valueBand: 'lt50', role: 'seller', counterparty: '0x1' }] });
  assert.notEqual(a, recordReadHash(body));
});
