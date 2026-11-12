import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The support desk works cases (view 78): the queue, reading a case with an
/// allowlisted records panel, replies that are held when they ask for a code,
/// notes, records only from the person's own account, linking an email case
/// only with proof, and fixes that point at a pending view 64 request.
///
///   npx tsx --test src/routes/supportDesk.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run: DATABASE_URL is set');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-support-desk-')));
process.env.ADMIN_API_TOKEN = 'desk-admin-test-token';
process.env.SUPPORT_API_TOKEN = 'desk-support-test-token';

const { memoryCaseStore, useCaseStoreForTests } = await import('../support/cases.js');
const store = memoryCaseStore('testnet');
useCaseStoreForTests(store);
const { supportDeskRoutes } = await import('./supportDesk.js');
const { createDeal } = await import('../db/deals.js');
const { upsertProfile } = await import('../db/profiles.js');
const { requestDesk } = await import('../middleware/twoPeople.js');
const { mayCall } = await import('../ops/adminPages.js');

const H = { 'x-admin-token': 'desk-support-test-token', 'content-type': 'application/json' };
const ME = `0x${'a1'.repeat(20)}`;
const OTHER = `0x${'b2'.repeat(20)}`;
const DEAL = `0x${'d1'.repeat(32)}`;
const STRANGER_DEAL = `0x${'d2'.repeat(32)}`;
const T0 = Date.parse('2026-11-12T10:00:00+01:00');

await createDeal({ jobId: DEAL, buyer: ME, seller: OTHER, dealAmountUsdc: '50', firstReleasePct: 100, acceptedAt: T0 } as never);
await createDeal({ jobId: STRANGER_DEAL, buyer: OTHER, seller: `0x${'c3'.repeat(20)}`, dealAmountUsdc: '9', firstReleasePct: 100 } as never);

const post = (path: string, body: unknown) => supportDeskRoutes.request(path, { method: 'POST', headers: H, body: JSON.stringify(body) });
const open = (over: Record<string, unknown> = {}) =>
  store.open({ address: ME, contactVerified: true, kind: 'money_in_deal', records: [{ kind: 'deal', id: DEAL }], channel: 'web', text: 'Held', role: 'person', now: T0, ...over });

test('queue is oldest due first', async () => {
  const late = await open({ now: T0 + 3_600_000, records: [] });
  const early = await open({ now: T0 - 3_600_000, records: [] });
  const res = await supportDeskRoutes.request('/', { headers: H });
  assert.equal(res.status, 200);
  const refs = ((await res.json()) as { cases: Array<{ ref: string }> }).cases.map((c) => c.ref);
  assert.ok(refs.indexOf(early.ref) < refs.indexOf(late.ref));
});

test('reading a case gives every message and an allowlisted records panel', async () => {
  const c = await open();
  await store.add(c.id, { role: 'note', memberId: 'm1', channel: 'desk', text: 'internal', at: T0 + 1 });
  const res = await supportDeskRoutes.request(`/${c.ref}`, { headers: H });
  const body = (await res.json()) as { messages: Array<{ role: string }>; records: Array<{ kind: string; amountUsdc: string }>; person: { name: string } };
  assert.deepEqual(body.messages.map((m) => m.role), ['person', 'note']);
  assert.equal(body.records[0]?.kind, 'deal');
  assert.equal(body.records[0]?.amountUsdc, '50');
  assert.ok(!JSON.stringify(body).includes('firstReleasePct'));
});

test('a held reply is not delivered and says why', async () => {
  const c = await open();
  const res = await post(`/${c.ref}/reply`, { text: 'Please send me the OTP you got' });
  assert.equal(res.status, 422);
  assert.equal(((await res.json()) as { code: string }).code, 'REPLY_HELD');
  assert.equal((await store.messages(c.id, { forPerson: true })).length, 1);
  assert.equal((await store.get(c.ref))?.firstRepliedAt, undefined);
});

test('a reply is kept and moves the case to waiting on the person', async () => {
  const c = await open();
  assert.equal((await post(`/${c.ref}/reply`, { text: 'Released now, check your balance.' })).status, 200);
  assert.equal((await store.get(c.ref))?.state, 'waiting_person');
});

test('a note is never delivered', async () => {
  const c = await open();
  assert.equal((await post(`/${c.ref}/note`, { text: 'Partner failure, not ours' })).status, 200);
  assert.equal((await store.messages(c.id, { forPerson: true })).length, 1);
  assert.equal((await store.messages(c.id, { forPerson: false })).length, 2);
});

test('state, assign and ask change the case', async () => {
  const c = await open();
  assert.equal((await post(`/${c.ref}/state`, { state: 'solved' })).status, 200);
  assert.ok((await store.get(c.ref))?.solvedAt);
  assert.equal((await post(`/${c.ref}/state`, { state: 'waiting_us' })).status, 200);
  assert.equal((await store.get(c.ref))?.solvedAt, undefined);
  assert.equal((await post(`/${c.ref}/state`, { state: 'lost' })).status, 400);
});

test('a record from another account is refused', async () => {
  const c = await open({ records: [] });
  assert.equal((await post(`/${c.ref}/records`, { kind: 'deal', id: STRANGER_DEAL })).status, 403);
  assert.equal((await post(`/${c.ref}/records`, { kind: 'deal', id: DEAL })).status, 200);
  assert.deepEqual((await store.get(c.ref))?.records, [{ kind: 'deal', id: DEAL }]);
});

test('linking without proof is refused, with the account\'s verified email it links', async () => {
  const c = await open({ address: undefined, email: 'ada@example.com', contactVerified: false, channel: 'email', records: [] });
  await upsertProfile({ address: OTHER, role: 'buyer', displayName: 'Ada', email: 'someone@example.com', emailVerified: true } as never);
  assert.equal((await post(`/${c.ref}/link`, { address: OTHER })).status, 409);
  await upsertProfile({ address: ME, role: 'buyer', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } as never);
  assert.equal((await post(`/${c.ref}/link`, { address: ME })).status, 200);
  const linked = await store.get(c.ref);
  assert.equal(linked?.address, ME);
  assert.equal(linked?.contactVerified, true);
});

test('a fix needs a pending request whose reason names the case', async () => {
  const c = await open();
  const desk = requestDesk();
  const base = {
    action: 'release', label: 'Pay the next milestone to the seller', method: 'POST', path: `/api/admin/deals/${DEAL}/release`, query: '', body: '',
    requestedBy: { memberId: 'm1', email: null, name: 'Tobi' }, requestedAt: T0, expiresAt: Date.now() + 3_600_000, snapshot: null, status: 'pending' as const,
  };
  await desk.store.insert({ ...base, id: 'req-other', reason: 'KT-9999: something else' });
  await desk.store.insert({ ...base, id: 'req-ok', reason: `${c.ref}: buyer confirmed delivery by message` });
  assert.equal((await post(`/${c.ref}/fixes`, { requestId: 'req-missing' })).status, 404);
  assert.equal((await post(`/${c.ref}/fixes`, { requestId: 'req-other' })).status, 409);
  assert.equal((await post(`/${c.ref}/fixes`, { requestId: 'req-ok' })).status, 200);
  assert.deepEqual((await store.get(c.ref))?.fixes, [{ requestId: 'req-ok', action: 'release' }]);
});

test('the teammates list gives names and ids only', async () => {
  const res = await supportDeskRoutes.request('/team', { headers: H });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { team: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(body.team));
  for (const m of body.team) assert.deepEqual(Object.keys(m).sort(), ['id', 'name']);
});

test('a member without the Support page cannot reach cases', () => {
  assert.equal(mayCall({ owner: false, pages: ['deals'] }, 'GET', '/api/admin/support/cases'), false);
  assert.equal(mayCall({ owner: false, pages: ['support'] }, 'POST', '/api/admin/support/cases/KT-1001/reply'), true);
});
