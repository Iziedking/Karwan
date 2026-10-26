import assert from 'node:assert/strict';
import test from 'node:test';
import { dealsRoutes } from './deals.js';

const JOB = `0x${'ab'.repeat(32)}`;
const BUYER = `0x${'11'.repeat(20)}`;

test('arrival cannot be confirmed by naming the buyer without the buyer session', async () => {
  const response = await dealsRoutes.request(`/direct/${JOB}/arrived`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caller: BUYER }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'forbidden');
});

test('the invite preview is an allowlist and carries no hardcoded copy', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./deals.ts', import.meta.url), 'utf8');
  const preview = source.slice(source.indexOf("dealsRoutes.get('/invite/:token'"), source.indexOf("dealsRoutes.post('/invite/:token/claim'"));
  assert.equal(preview.includes('termsPreview'), false);
  assert.equal(preview.includes('inviterTrust'), true);
});

test('turning down terms is the seller session only and cannot move money', async () => {
  const response = await dealsRoutes.request(`/direct/${JOB}/decline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caller: BUYER, note: 'Too low' }),
  });
  assert.notEqual(response.status, 200);
  const source = await (await import('node:fs/promises')).readFile(new URL('./deals.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("dealsRoutes.post('/direct/:jobId/decline'"), source.indexOf("dealsRoutes.get('/invite/:token'"));
  assert.match(route, /isSessionSelf\(c, body\.caller\)/);
  assert.match(route, /!== deal\.seller/);
  assert.equal(/dealEscrowOps|cancelledAt:/.test(route), false);
});

test('a request for more time follows the delivery-date rules, and an approval counts from now when late', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./deals.ts', import.meta.url), 'utf8');
  const ask = source.slice(source.indexOf("dealsRoutes.post('/direct/:jobId/extension/request'"), source.indexOf('const extensionRespondSchema'));
  assert.match(ask, /sellerMayAskMoreTime\(deal, requestedAt, config\.DEAL_DEADLINE_RECLAIM_GRACE_MS\)/);
  assert.match(ask, /code: 'too-late'/);
  assert.match(ask, /code: 'already-asked'/);
  const answer = source.slice(source.indexOf("dealsRoutes.post('/direct/:jobId/extension/respond'"));
  assert.match(answer.slice(0, 4000), /approvedDeadline\(deal\.deadlineUnix, Math\.floor\(decidedAt \/ 1000\), req\.additionalSeconds\)/);
  assert.match(answer.slice(0, 4000), /patch\.deadlineAlertedAt = undefined/);
});

test('each milestone on the escrow family is released only after its own delivery', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./deals.ts', import.meta.url), 'utf8');
  const release = source.slice(source.indexOf("dealsRoutes.post('/direct/:jobId/release'"));
  const gate = release.indexOf('awaitingNextDelivery(deal, account.milestonesReleased)');
  assert.ok(gate > 0 && gate < release.indexOf('inFlight.add(jobId)'), 'the release route refuses before anything is sent');
  assert.match(release.slice(0, gate + 400), /code: 'milestone-not-delivered'/);
  const deliver = source.slice(source.indexOf("dealsRoutes.post('/direct/:jobId/delivered'"), source.indexOf("dealsRoutes.post('/direct/:jobId/release'"));
  assert.match(deliver, /if \(deal\.delivered && !correctionRequested && !nextMilestoneDue\)/);
  assert.match(deliver, /deliveredMilestone: account\.milestonesReleased/);
  const milestones = await (await import('node:fs/promises')).readFile(new URL('./milestones.ts', import.meta.url), 'utf8');
  assert.match(milestones, /code: 'release-per-milestone'/);
});

test('a direct deal is one to five milestones that add up to 100', async () => {
  const { milestonePctsSchema } = await import('./deals.js');
  assert.equal(milestonePctsSchema.safeParse([20, 30, 50]).success, true);
  assert.equal(milestonePctsSchema.safeParse([10, 20, 20, 20, 30]).success, true);
  assert.equal(milestonePctsSchema.safeParse([100]).success, true);
  assert.equal(milestonePctsSchema.safeParse([]).success, false);
  assert.equal(milestonePctsSchema.safeParse([10, 10, 10, 10, 10, 50]).success, false);
  assert.equal(milestonePctsSchema.safeParse([40, 40]).success, false);
});
