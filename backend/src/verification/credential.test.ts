import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';

const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
process.env.ATTESTATION_ISSUER_PRIVATE_KEY = TEST_KEY;
delete process.env.ATTESTATION_ISSUER_ADDRESS;

const { buildRecordCredential, verifyRecordCredential } = await import('./credential.js');
const { resetIssuerCache } = await import('../attestation/issuer.js');

const issuer = privateKeyToAccount(TEST_KEY).address;
const now = Date.UTC(2026, 9, 12);
const YEAR = 365 * 24 * 3_600_000;

const base = {
  subject: '0xAda0000000000000000000000000000000000001',
  level: 'work_verified' as const,
  tier: 'Established',
  reasons: ['NEW_ON_KARWAN', 'WORK_CONFIRMED_BY_CLIENT'],
  chainId: 5042002,
  factsContract: '0x00000000000000000000000000000000000000fa',
  now,
  facts: [
    { kind: 'client_confirmation', level: 'user_proof', issuedAt: now - 1000, expiresAt: now + YEAR, txHash: '0x01' },
    { kind: 'person_check', level: 'person', issuedAt: now - 1000, expiresAt: now - 1 },
  ],
};

test('a credential verifies against the issuer address without calling Karwan', async () => {
  resetIssuerCache();
  const doc = await buildRecordCredential(base);
  assert.ok(doc);
  assert.equal(doc.type, 'karwan.record.v2');
  assert.equal(doc.subject.address, base.subject.toLowerCase());
  assert.equal(await verifyRecordCredential(doc, issuer), true);
});

test('only facts valid now are listed', async () => {
  resetIssuerCache();
  const doc = await buildRecordCredential(base);
  assert.deepEqual(doc!.claim.facts.map((f) => f.kind), ['client_confirmation']);
});

test('changing any field breaks the signature', async () => {
  resetIssuerCache();
  const doc = (await buildRecordCredential(base))!;
  const raised = { ...doc, claim: { ...doc.claim, level: 'id_verified' as const } };
  assert.equal(await verifyRecordCredential(raised, issuer), false);
  const extraFact = { ...doc, claim: { ...doc.claim, facts: [...doc.claim.facts, { ...doc.claim.facts[0], kind: 'karwan_deal' }] } };
  assert.equal(await verifyRecordCredential(extraFact, issuer), false);
  const otherSubject = { ...doc, subject: { address: '0x00000000000000000000000000000000000000b0' } };
  assert.equal(await verifyRecordCredential(otherSubject, issuer), false);
});

test('a different issuer address does not verify', async () => {
  resetIssuerCache();
  const doc = (await buildRecordCredential(base))!;
  assert.equal(await verifyRecordCredential(doc, '0x000000000000000000000000000000000000dead'), false);
});

test('the credential expires within a day of issue', async () => {
  resetIssuerCache();
  const doc = (await buildRecordCredential(base))!;
  assert.equal(Date.parse(doc.expiresAt) - Date.parse(doc.issuedAt), 24 * 3_600_000);
});

test('the signed copy carries no evidence fingerprint, the same as the record page', async () => {
  resetIssuerCache();
  const doc = (await buildRecordCredential(base))!;
  assert.doesNotMatch(JSON.stringify(doc), /evidenceHash/);
  assert.deepEqual(Object.keys(doc.claim.facts[0]!).sort(), ['expiresAt', 'issuedAt', 'kind', 'level', 'txHash']);
});

test('the Arc transaction of each fact is covered by the signature', async () => {
  resetIssuerCache();
  const doc = (await buildRecordCredential(base))!;
  const moved = { ...doc, claim: { ...doc.claim, facts: [{ ...doc.claim.facts[0]!, txHash: '0x02' }] } };
  assert.equal(await verifyRecordCredential(moved, issuer), false);
});
