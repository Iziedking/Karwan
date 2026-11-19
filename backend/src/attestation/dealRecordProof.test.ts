import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';

/// Karwan's signature on a deal record (view 94): it covers the whole record,
/// it is made with the key the issuer manifest names, and a changed record no
/// longer verifies.
///
///   npx tsx --test src/attestation/dealRecordProof.test.ts

/// Hardhat's first development account, as in issuer.test.ts.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
process.env.ATTESTATION_ISSUER_PRIVATE_KEY = TEST_KEY;
delete process.env.ATTESTATION_ISSUER_ADDRESS;

const { signDealRecord, verifyDealRecord } = await import('./dealRecordProof.js');
const { issuerManifest, DEAL_RECORD_EIP712_TYPES, DEAL_SETTLED_EIP712_TYPES } = await import('./credential.js');
const { dealRecordDigest } = await import('../deals/dealRecord.js');
type DealRecord = import('../deals/dealRecord.js').DealRecord;

const CHAIN_ID = 5042002;

const record: DealRecord = {
  v: 1,
  jobId: '0xd68fe7d8aaaabbbbccccddddeeeeffff00001111222233334444555566667777',
  reference: 'D68F-E7D8',
  kind: 'one_time',
  buyer: '0x1111111111111111111111111111111111111111',
  seller: '0x2222222222222222222222222222222222222222',
  agreed: { digest: '0xagree', buyerAt: 1, sellerAt: 2, title: 'A navy suit', priceUsdc: '100' },
  held: { usdc: '100', at: 3, tx: '0xfund', reference: 'KWN-FUND' },
  stages: [{ index: 0, confirmed: { way: 'buyer_confirmed', at: 8 }, released: { sellerUsdc: '98', refundUsdc: '0', feeUsdc: '2', at: 8, tx: '0xpay', reference: 'KWN-PAY' } }],
  ended: 'settled',
  endedAt: 9,
};

test('the record is signed by the key the manifest names, over its digest', async () => {
  const signed = await signDealRecord(record, 1_000, CHAIN_ID);
  assert.ok(signed, 'the test key must sign');
  assert.equal(signed.digest, dealRecordDigest(record));
  assert.equal(signed.proof.issuer, privateKeyToAccount(TEST_KEY).address);
  assert.equal(signed.proof.primaryType, 'KarwanDealRecord');
  assert.deepEqual(signed.proof.domain, { name: 'Karwan Attestation', version: '1', chainId: CHAIN_ID });
  assert.equal(await verifyDealRecord(record, 1_000, signed.proof), true);
});

test('any changed fact, or a changed time, no longer verifies', async () => {
  const signed = (await signDealRecord(record, 1_000, CHAIN_ID))!;
  const paidMore = { ...record, stages: [{ ...record.stages[0]!, released: { ...record.stages[0]!.released!, sellerUsdc: '99' } }] };
  assert.equal(await verifyDealRecord(paidMore, 1_000, signed.proof), false);
  assert.equal(await verifyDealRecord({ ...record, stages: [{ ...record.stages[0]!, confirmed: { way: 'review_window', at: 8 } }] }, 1_000, signed.proof), false);
  assert.equal(await verifyDealRecord(record, 1_001, signed.proof), false);
});

test('a proof naming another issuer does not verify', async () => {
  const signed = (await signDealRecord(record, 1_000, CHAIN_ID))!;
  const other = { ...signed.proof, issuer: '0x3333333333333333333333333333333333333333' };
  assert.equal(await verifyDealRecord(record, 1_000, other), false);
  assert.equal(await verifyDealRecord(record, 1_000, { ...signed.proof, signature: '0x1234' }), false);
});

test('the manifest publishes the record type beside the statement, and the statement is unchanged', () => {
  const m = issuerManifest(CHAIN_ID);
  assert.deepEqual(m.credentialTypes[0]!.proof.types, DEAL_SETTLED_EIP712_TYPES);
  const rec = m.credentialTypes.find((t) => t.proof.primaryType === 'KarwanDealRecord');
  assert.ok(rec, 'the record type is published');
  assert.deepEqual(rec.proof.types, DEAL_RECORD_EIP712_TYPES);
  assert.deepEqual(DEAL_RECORD_EIP712_TYPES, {
    KarwanDealRecord: [
      { name: 'dealRef', type: 'bytes32' },
      { name: 'recordDigest', type: 'bytes32' },
      { name: 'writtenAt', type: 'uint64' },
    ],
  });
  assert.deepEqual(
    DEAL_SETTLED_EIP712_TYPES.DealSettled.map((f) => f.name),
    ['subject', 'dealRef', 'role', 'settledAt', 'amountBand', 'currency', 'chainId', 'viaDispute'],
  );
});
