import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// Your deal record (view 94): the two sides read it, either side shares it by
/// a link it can take back, and the shared copy names people, never addresses.
///
///   npx tsx --test src/routes/dealRecords.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run: DATABASE_URL is set');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-deal-records-')));
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'deal-records-test-secret';

const { dealRecordRoutes, sharedDealRecordRoutes } = await import('./dealRecords.js');
const { signSession } = await import('../auth/session.js');
const { createDeal } = await import('../db/deals.js');
const { saveDealRecordOnce } = await import('../db/dealRecords.js');
const { upsertProfile } = await import('../db/profiles.js');

const BUYER = `0x${'a1'.repeat(20)}`;
const SELLER = `0x${'b2'.repeat(20)}`;
const STRANGER = `0x${'c3'.repeat(20)}`;
const JOB = `0x${'d4'.repeat(32)}`;
const TX = `0x${'e5'.repeat(32)}`;
const T = 1_763_500_000_000;

const cookie = (address: string) => ({ cookie: `karwan_session=${signSession({ address, method: 'web3' })}` });
const as = (address: string, method = 'GET') => ({ method, headers: cookie(address) });

await createDeal({ jobId: JOB, buyer: BUYER, seller: SELLER, dealAmountUsdc: '100', firstReleasePct: 100, terms: 'A navy suit' } as never);
await upsertProfile({ address: BUYER, role: 'buyer', displayName: 'Ada Obi', handle: 'ada' } as never);
await upsertProfile({ address: SELLER, role: 'seller', displayName: 'Musa Tailors', handle: 'musa' } as never);
await saveDealRecordOnce({
  jobId: JOB,
  digest: `0x${'f6'.repeat(32)}`,
  writtenAt: T + 9_000,
  proof: {
    type: 'eip712',
    primaryType: 'KarwanDealRecord',
    domain: { name: 'Karwan Attestation', version: '1', chainId: 5042002 },
    issuer: `0x${'99'.repeat(20)}`,
    signature: '0xabcd',
  },
  record: {
    v: 1,
    jobId: JOB,
    reference: 'KWN-AAAA-BBBB',
    kind: 'goods',
    buyer: BUYER,
    seller: SELLER,
    agreed: { digest: null, buyerAt: T, sellerAt: T, title: 'A navy suit', priceUsdc: '100' },
    held: { usdc: '100', at: T + 1_000, tx: TX, reference: 'KWN-HELD' },
    stages: [
      {
        index: 0,
        confirmed: { way: 'buyer_confirmed', at: T + 5_000 },
        released: { sellerUsdc: '99', refundUsdc: '0', feeUsdc: '1', at: T + 6_000, tx: TX, reference: 'KWN-PAID' },
      },
    ],
    ended: 'settled',
    endedAt: T + 6_000,
  } as never,
});

const PERSON_ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;

test('someone who is not a side of the deal gets 404', async () => {
  assert.equal((await dealRecordRoutes.request(`/${JOB}/record`, as(STRANGER))).status, 404);
  assert.equal((await dealRecordRoutes.request(`/${JOB}/record`)).status, 404);
  assert.equal((await dealRecordRoutes.request(`/${JOB}/record/share`, as(STRANGER, 'POST'))).status, 404);
});

test('a side gets the record, its signature and no link yet', async () => {
  const res = await dealRecordRoutes.request(`/${JOB}/record`, as(BUYER));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { side: string; record: { jobId: string }; proof: { signature: string }; digest: string; share: string | null };
  assert.equal(body.side, 'buyer');
  assert.equal(body.record.jobId, JOB);
  assert.equal(body.proof.signature, '0xabcd');
  assert.equal(body.share, null);
});

test('sharing makes one link per side, and the shared copy names people, never addresses', async () => {
  const made = (await (await dealRecordRoutes.request(`/${JOB}/record/share`, as(SELLER, 'POST'))).json()) as { token: string; link: string };
  assert.ok(made.link.endsWith(`/deal-record/${made.token}`));
  const again = (await (await dealRecordRoutes.request(`/${JOB}/record/share`, as(SELLER, 'POST'))).json()) as { token: string };
  assert.equal(again.token, made.token);
  const mine = (await (await dealRecordRoutes.request(`/${JOB}/record`, as(SELLER))).json()) as { share: string | null };
  assert.equal(mine.share, made.token);

  const res = await sharedDealRecordRoutes.request(`/shared/${made.token}`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.doesNotMatch(text, PERSON_ADDRESS);
  const body = JSON.parse(text) as { sharedBy: string; buyer: { name: string; tag: string }; seller: { name: string; tag: string }; record: { stages: unknown[]; held: { tx: string } } };
  assert.equal(body.sharedBy, 'seller');
  assert.deepEqual(body.buyer, { name: 'Ada Obi', tag: 'ada' });
  assert.deepEqual(body.seller, { name: 'Musa Tailors', tag: 'musa' });
  assert.equal(body.record.stages.length, 1);
  assert.equal(body.record.held.tx, TX);
});

test('a link taken back is gone, and the next one is new', async () => {
  const first = (await (await dealRecordRoutes.request(`/${JOB}/record/share`, as(BUYER, 'POST'))).json()) as { token: string };
  assert.equal((await dealRecordRoutes.request(`/${JOB}/record/share`, as(BUYER, 'DELETE'))).status, 200);
  assert.equal((await sharedDealRecordRoutes.request(`/shared/${first.token}`)).status, 404);
  const second = (await (await dealRecordRoutes.request(`/${JOB}/record/share`, as(BUYER, 'POST'))).json()) as { token: string };
  assert.notEqual(second.token, first.token);
});

test('an unknown link is 404', async () => {
  assert.equal((await sharedDealRecordRoutes.request('/shared/not-a-real-token')).status, 404);
});
