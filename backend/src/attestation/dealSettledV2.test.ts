import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DealRecord } from '../deals/dealRecord.js';

/// The public deal statement, version 2 (view 94): version 1's claim plus how
/// the work was confirmed. Version 1 keeps being issued before the switch-on
/// day and keeps verifying.
///
///   npx tsx --test src/attestation/dealSettledV2.test.ts

const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
process.env.ATTESTATION_ISSUER_PRIVATE_KEY = TEST_KEY;
delete process.env.ATTESTATION_ISSUER_ADDRESS;

const { issueDealSettled, verifyDealSettled } = await import('./issuer.js');
const { DEAL_SETTLED_TYPE, DEAL_SETTLED_V2_TYPE, CONFIRMED_BY, dealSettledSchemaV2, issuerManifest, toVerifiableCredential } = await import('./credential.js');
const { confirmedByOf, statementVersion } = await import('./sweep.js');

const CHAIN_ID = 5042002;
const SETTLED = Date.parse('2026-12-01T10:00:00.000Z');

const input = (confirmedBy?: (typeof CONFIRMED_BY)[number]) => ({
  jobId: 'job-1',
  subject: '0x2222222222222222222222222222222222222222',
  role: 'seller' as const,
  settledAt: SETTLED,
  amountUsdc: 4200,
  viaDispute: false,
  chainId: CHAIN_ID,
  ...(confirmedBy ? { confirmedBy } : {}),
});

test('a v2 statement has a v2 id and type and says how the work was confirmed', async () => {
  const out = await issueDealSettled(input('handover_code'));
  assert.ok(out);
  assert.match(out.id, /^deal-settled-v2-[0-9a-f]{64}-seller$/);
  assert.equal(out.document.type, DEAL_SETTLED_V2_TYPE);
  assert.equal((out.document.claim as { confirmedBy?: string }).confirmedBy, 'handover_code');
  assert.match(out.document.schema, /\/schemas\/deal-settled\/v2\.json$/);
  assert.equal(await verifyDealSettled(out.document), true);
});

test('changing how the work was confirmed breaks the v2 signature', async () => {
  const out = await issueDealSettled(input('buyer_confirmed'));
  assert.ok(out);
  const forged = { ...out.document, claim: { ...out.document.claim, confirmedBy: 'dispute' } } as typeof out.document;
  assert.equal(await verifyDealSettled(forged), false);
});

test('without a confirmation way the statement is still v1 and still verifies', async () => {
  const out = await issueDealSettled(input());
  assert.ok(out);
  assert.match(out.id, /^deal-settled-v1-/);
  assert.equal(out.document.type, DEAL_SETTLED_TYPE);
  assert.equal('confirmedBy' in out.document.claim, false);
  assert.equal(await verifyDealSettled(out.document), true);
});

test('the v2 schema requires the way and never allows a cancel or a refund', () => {
  const schema = dealSettledSchemaV2();
  assert.match(schema.$id, /\/v2\.json$/);
  assert.ok(schema.properties.claim.required.includes('confirmedBy'));
  const ways = schema.properties.claim.properties.confirmedBy.enum as readonly string[];
  assert.deepEqual([...ways].sort(), [...CONFIRMED_BY].sort());
  assert.equal(ways.includes('cancelled_by_both'), false);
  assert.equal(ways.includes('refunded'), false);
});

test('the manifest lists v1 and v2', () => {
  const types = issuerManifest(CHAIN_ID).credentialTypes.map((t) => t.type);
  assert.ok(types.includes(DEAL_SETTLED_TYPE));
  assert.ok(types.includes(DEAL_SETTLED_V2_TYPE));
});

test('the W3C copy of a v2 statement carries the way and the v2 signed message', async () => {
  const out = await issueDealSettled(input('buyer_silent'));
  assert.ok(out);
  const vc = toVerifiableCredential(out.document) as {
    type: string[];
    credentialSubject: { confirmedBy?: string };
    proof: { eip712: { primaryType: string; message: { confirmedBy?: string } } };
  };
  assert.equal(vc.credentialSubject.confirmedBy, 'buyer_silent');
  assert.equal(vc.proof.eip712.primaryType, 'DealSettledV2');
  assert.equal(vc.proof.eip712.message.confirmedBy, 'buyer_silent');
  JSON.stringify(vc);
});

const record = (ways: string[]): DealRecord =>
  ({ stages: ways.map((way, index) => ({ index, confirmed: { way, at: null }, released: null })) }) as unknown as DealRecord;

test('the way is the last stage’s, and a cancel or refund reads as not recorded', () => {
  assert.equal(confirmedByOf(record(['review_window', 'handover_code'])), 'handover_code');
  assert.equal(confirmedByOf(record(['buyer_confirmed', 'refunded'])), 'not_recorded');
  assert.equal(confirmedByOf(record(['cancelled_by_both'])), 'not_recorded');
  assert.equal(confirmedByOf(record([])), 'not_recorded');
});

test('v2 from the switch-on day, v1 before it and while it is unset', () => {
  const day = Date.parse('2026-11-25T00:00:00.000Z');
  assert.equal(statementVersion(day - 1, day), 1);
  assert.equal(statementVersion(day, day), 2);
  assert.equal(statementVersion(day + 1, undefined), 1);
});
