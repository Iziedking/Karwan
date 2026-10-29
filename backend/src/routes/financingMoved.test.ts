import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// Getting paid early runs on the escrow family only (view 18): the older
/// escrow and the purchase-order contract take no new lines.
///
///   npx tsx --test src/routes/financingMoved.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-financing-moved-')));
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET ??= 'financing-moved-test-secret-at-least-32-characters';
const { factoringRoutes, useFamilyFinancing } = await import('./factoring.js');
const { poFinancingRoutes } = await import('./poFinancing.js');
const { signSession } = await import('../auth/session.js');
const { createDeal } = await import('../db/deals.js');

const SELLER = `0x${'5e'.repeat(20)}`;
const V2_DEAL = `0x${'a2'.repeat(32)}`;
const FAMILY_DEAL = `0x${'f1'.repeat(32)}`;
const cookie = `karwan_session=${signSession({ address: SELLER, method: 'circle' })}`;
const post = (app: { request: (p: string, i: RequestInit) => Response | Promise<Response> }, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const base = { buyer: `0x${'b0'.repeat(20)}`, seller: SELLER, dealAmountUsdc: '150', firstReleasePct: 100, tradeLane: 'finance' as const, acceptedAt: 1 };
await createDeal({ ...base, jobId: V2_DEAL } as never);
await createDeal({ ...base, jobId: FAMILY_DEAL, escrowVersion: 'suite', escrowDealId: `0x${'11'.repeat(32)}` } as never);

test('an older escrow deal cannot ask to be paid early any more', async () => {
  const res = await post(factoringRoutes, '/request', { invoiceId: V2_DEAL });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'FINANCING_MOVED');
});

test('a family deal asks through the core, before delivery', async () => {
  useFamilyFinancing({
    core: {} as never,
    receivable: async () => ({ asset: '0x36', seller: '0xa9', unpaid: 150_000_000n, horizon: 1n, open: true, financeable: true }),
    sellerReady: async () => true,
    freeGuarantee: async () => 0n,
  });
  const res = await post(factoringRoutes, '/request', { invoiceId: FAMILY_DEAL });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).deal.factoringRequestedAdvanceUsdc, '150');
  useFamilyFinancing(null);
});

test('a family deal answers not set up when the family is not connected', async () => {
  const res = await post(factoringRoutes, '/request', { invoiceId: FAMILY_DEAL });
  assert.equal(res.status, 503);
});

test('purchase-order financing takes no new requests', async () => {
  const res = await post(poFinancingRoutes, '/request', { invoiceId: V2_DEAL, requestedAdvanceUsdc: '100' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'FINANCING_MOVED');
});

test('purchase-order financing opens no new lines from a held wallet', async () => {
  const res = await post(poFinancingRoutes, '/fund-circle', { invoiceId: V2_DEAL });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'FINANCING_MOVED');
});
