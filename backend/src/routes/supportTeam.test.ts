import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The support surface for held matches and held links (view 21): listed
/// without a ticket, cleared with a reason by either credential.
///
///   npx tsx --test src/routes/supportTeam.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-support-held-')));
process.env.ADMIN_API_TOKEN = 'held-admin-test-token';
process.env.SUPPORT_API_TOKEN = 'held-support-test-token';

const { supportTeamRoutes } = await import('./supportTeam.js');
const { createDeal, patchDeal, getDeal } = await import('../db/deals.js');
const { recordLinkOffense } = await import('../security/linkOffenses.js');

const support = { 'x-admin-token': 'held-support-test-token', 'content-type': 'application/json' };
const admin = { 'x-admin-token': 'held-admin-test-token', 'content-type': 'application/json' };
const NOW = Date.now();
const REASON = 'Checked the earlier deal: the flagged link was the seller own site, cleared on review.';

async function heldDeal(jobId: string, over: Record<string, unknown> = {}) {
  await createDeal({
    jobId, buyer: '0xBUYER', seller: '0xSELLER', dealAmountUsdc: '104.66', firstReleasePct: 100,
    sellerApprovedAt: NOW - 2000, acceptedAt: NOW - 1000, fundTxHash: '0xf',
    ...over,
  } as never);
  await patchDeal(jobId, {
    matchRisk: {
      decision: 'hold', flags: ['link-offense'], reason: 'The buyer has prior unsafe-link offenses on record (1).',
      reasons: [{ text: 'The buyer has prior unsafe-link offenses on record (1).', audience: 'seller' }],
      paidConsulted: false, evaluatedAt: NOW - 500,
    },
  });
}

test('the held list is for operators only and names the offence a hold rests on', async () => {
  await heldDeal('0xheld1');
  recordLinkOffense({ address: '0xBUYER', jobId: '0xearlier', surface: 'delivery', verdict: 'suspicious', reasons: ['.xyz'] });
  assert.equal((await supportTeamRoutes.request('/held')).status, 401);
  const res = await supportTeamRoutes.request('/held', { headers: support });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { matches: Array<{ jobId: string; flags: string[]; offences: Array<{ address: string; count: number; from: Array<{ jobId: string }> }> }>; links: unknown[] };
  const row = body.matches.find((m) => m.jobId === '0xheld1');
  assert.ok(row);
  assert.deepEqual(row.flags, ['link-offense']);
  assert.equal(row.offences[0]?.address, '0xbuyer');
  assert.equal(row.offences[0]?.count, 1);
  assert.equal(row.offences[0]?.from[0]?.jobId, '0xearlier');
  assert.deepEqual(body.links, []);
});

test('the support credential clears a hold with a reason; the record keeps the role, not the reason for the parties', async () => {
  await heldDeal('0xheld2');
  const short = await supportTeamRoutes.request('/matches/0xheld2/clear', { method: 'POST', headers: support, body: JSON.stringify({ reason: 'ok' }) });
  assert.equal(short.status, 400);
  const res = await supportTeamRoutes.request('/matches/0xheld2/clear', { method: 'POST', headers: support, body: JSON.stringify({ reason: REASON }) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { cleared: boolean; matchRisk: { clearedAt?: number; clearedBy?: string; clearReason?: string } };
  assert.equal(body.cleared, true);
  assert.equal(body.matchRisk.clearedBy, 'support');
  assert.equal(body.matchRisk.clearReason, undefined, 'the reason stays on the server');
  const saved = await getDeal('0xheld2');
  assert.equal(saved?.matchRisk?.clearReason, REASON);
  assert.ok(saved?.matchRisk?.clearedAt);
  const again = await supportTeamRoutes.request('/matches/0xheld2/clear', { method: 'POST', headers: admin, body: JSON.stringify({ reason: REASON }) });
  assert.equal(again.status, 409);
  const held = (await (await supportTeamRoutes.request('/held', { headers: admin })).json()) as { matches: Array<{ jobId: string }> };
  assert.equal(held.matches.some((m) => m.jobId === '0xheld2'), false, 'a cleared hold leaves the list');
  assert.equal((await supportTeamRoutes.request('/matches/0xnone/clear', { method: 'POST', headers: admin, body: JSON.stringify({ reason: REASON }) })).status, 404);
});

test('an earlier delivery of a closed deal can be read for a record-only review', async () => {
  await createDeal({
    jobId: '0xclosed', buyer: '0xB2', seller: '0xS2', dealAmountUsdc: '50', firstReleasePct: 100,
    sellerApprovedAt: NOW - 9000, acceptedAt: NOW - 8000, fundTxHash: '0xf',
  } as never);
  await patchDeal('0xclosed', {
    delivered: true, deliveredAt: NOW - 1000, deliveryRevision: 3, deliveryProof: 'outlier.ai/x', verificationStatus: 'clean', settledAt: NOW - 100,
    deliveryHistory: [
      { revision: 1, submittedAt: NOW - 3000, deliveryProof: 'www.arcrun.xyz', verificationStatus: 'suspicious' },
      { revision: 2, submittedAt: NOW - 2000, deliveryProof: 'arcrun.xyz', verificationStatus: 'suspicious' },
      { revision: 3, submittedAt: NOW - 1000, deliveryProof: 'outlier.ai/x', verificationStatus: 'clean' },
    ],
  });
  const res = await supportTeamRoutes.request('/deliveries/0xclosed?revision=2', { headers: support });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { scope: string; revision: number; deliveryProof: string; verificationStatus: string; closed: boolean; deliveries: Array<{ revision: number; reviewed: string | null }> };
  assert.equal(body.scope, 'record-only');
  assert.equal(body.revision, 2);
  assert.equal(body.deliveryProof, 'arcrun.xyz');
  assert.equal(body.verificationStatus, 'suspicious');
  assert.equal(body.closed, true);
  assert.deepEqual(body.deliveries.map((d) => d.revision), [2, 1]);
  assert.equal((await supportTeamRoutes.request('/deliveries/0xclosed?revision=7', { headers: support })).status, 404);
  const current = (await (await supportTeamRoutes.request('/deliveries/0xclosed', { headers: support })).json()) as { revision: number; scope: string };
  assert.equal(current.revision, 3);
  assert.equal(current.scope, 'record-only', 'a closed deal is record-only even for its current delivery');
});
