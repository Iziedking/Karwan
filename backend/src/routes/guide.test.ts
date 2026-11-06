import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The next move is read from the caller's own session (view 57).
///
///   npx tsx --test src/routes/guide.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-guide-next-')));
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET ??= 'guide-next-test-secret-at-least-32-characters-long';
const { guideRoutes } = await import('./guide.js');
const { signSession } = await import('../auth/session.js');
const { createDeal, patchDeal } = await import('../db/deals.js');

const BUYER = `0x${'b1'.repeat(20)}`;
const SELLER = `0x${'5e'.repeat(20)}`;
const DEAL = `0x${'d1'.repeat(32)}`;
const as = (address: string) => ({ headers: { cookie: `karwan_session=${signSession({ address, method: 'circle' })}` } });

await createDeal({ jobId: DEAL, buyer: BUYER, seller: SELLER, dealAmountUsdc: '120', firstReleasePct: 100, tradeLane: 'freelance', acceptedAt: 1 } as never);
await patchDeal(DEAL, { delivered: true } as never);

test('no session, no moves', async () => {
  const res = await guideRoutes.request('/next');
  assert.equal(res.status, 401);
});

test('the buyer of a delivered deal is asked to check it; the seller is not', async () => {
  const buyer = await (await guideRoutes.request('/next', as(BUYER))).json();
  assert.equal(buyer.moves[0]?.kind, 'approve_delivery');
  assert.equal(buyer.moves[0]?.href, `/deals/${DEAL}`);
  const seller = await (await guideRoutes.request('/next', as(SELLER))).json();
  assert.equal(seller.moves.some((m: { kind: string }) => m.kind === 'approve_delivery'), false);
});

test('an address in the query is ignored: it is always the caller', async () => {
  const res = await (await guideRoutes.request(`/next?address=${BUYER}`, as(SELLER))).json();
  assert.equal(res.moves.some((m: { kind: string }) => m.kind === 'approve_delivery'), false);
});
