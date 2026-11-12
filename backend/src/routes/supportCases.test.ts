import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// A person's own cases (view 78): open one, list them, read one, write more.
///
///   npx tsx --test src/routes/supportCases.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run: DATABASE_URL is set');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-support-cases-')));
process.env.SESSION_SECRET = 'support-cases-test-secret';

const { memoryCaseStore, useCaseStoreForTests } = await import('../support/cases.js');
const store = memoryCaseStore('testnet');
useCaseStoreForTests(store);
const { supportCasesRoutes } = await import('./supportCases.js');
const { signSession } = await import('../auth/session.js');
const { createDeal } = await import('../db/deals.js');

const ME = `0x${'a1'.repeat(20)}`;
const OTHER = `0x${'b2'.repeat(20)}`;
const DEAL = `0x${'d1'.repeat(32)}`;
const NOT_MINE = `0x${'d9'.repeat(32)}`;
await createDeal({ jobId: DEAL, buyer: ME, seller: OTHER, dealAmountUsdc: '50', firstReleasePct: 100 } as never);
await createDeal({ jobId: NOT_MINE, buyer: OTHER, seller: `0x${'c3'.repeat(20)}`, dealAmountUsdc: '9', firstReleasePct: 100 } as never);

const as = (address: string, ip = '10.20.0.1') => ({ cookie: `karwan_session=${signSession({ address, method: 'web3' })}`, 'content-type': 'application/json', 'x-real-ip': ip });
const post = (path: string, who: string, body: unknown, ip?: string) => supportCasesRoutes.request(path, { method: 'POST', headers: as(who, ip), body: JSON.stringify(body) });

test('opening a case needs a session', async () => {
  const res = await supportCasesRoutes.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Help' }) });
  assert.equal(res.status, 401);
});

test('opening gives the reference and when a person replies', async () => {
  const res = await post('/', ME, { text: 'My payout never arrived' }, '10.20.0.2');
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ref: string; joined: boolean; dueAt: number; outOfHours: string | null };
  assert.match(body.ref, /^KT-\d{4}$/);
  assert.equal(body.joined, false);
  assert.ok(body.dueAt > Date.now());
});

test('opening about an open case\'s deal joins it', async () => {
  const a = (await (await post('/', ME, { text: 'Money held', records: [{ kind: 'deal', id: DEAL }] }, '10.20.0.3')).json()) as { ref: string };
  const b = (await (await post('/', ME, { text: 'Still held', records: [{ kind: 'deal', id: DEAL }] }, '10.20.0.3')).json()) as { ref: string; joined: boolean };
  assert.equal(b.ref, a.ref);
  assert.equal(b.joined, true);
});

test('a record the person is not a party to is refused', async () => {
  const res = await post('/', ME, { text: 'Look at this', records: [{ kind: 'deal', id: NOT_MINE }] }, '10.20.0.4');
  assert.equal(res.status, 403);
});

test('another person\'s case answers not found', async () => {
  const { ref } = (await (await post('/', ME, { text: 'Mine' }, '10.20.0.5')).json()) as { ref: string };
  assert.equal((await supportCasesRoutes.request(`/${ref}`, { headers: as(OTHER) })).status, 404);
  assert.equal((await post(`/${ref}/messages`, OTHER, { text: 'I am them' })).status, 404);
  assert.equal((await supportCasesRoutes.request(`/${ref}`, { headers: as(ME) })).status, 200);
});

test('notes never appear and the list shows the last line', async () => {
  const { ref } = (await (await post('/', ME, { text: 'Question' }, '10.20.0.6')).json()) as { ref: string };
  const c = (await store.get(ref))!;
  await store.add(c.id, { role: 'note', memberId: 'm1', channel: 'desk', text: 'internal only', at: Date.now() });
  await store.add(c.id, { role: 'teammate', memberId: 'm1', channel: 'desk', text: 'Here is the answer', at: Date.now() + 1 });
  const read = (await (await supportCasesRoutes.request(`/${ref}`, { headers: as(ME) })).json()) as { messages: Array<{ role: string; text: string }>; case: Record<string, unknown> };
  assert.ok(read.messages.every((m) => m.role !== 'note'));
  assert.ok(!JSON.stringify(read).includes('internal only'));
  assert.equal(read.case.assignee, undefined);
  const list = (await (await supportCasesRoutes.request('/', { headers: as(ME) })).json()) as { cases: Array<{ ref: string; lastLine: string }> };
  assert.equal(list.cases.find((x) => x.ref === ref)?.lastLine, 'Here is the answer');
});

test('writing more reopens a solved case', async () => {
  const { ref } = (await (await post('/', ME, { text: 'Thing' }, '10.20.0.7')).json()) as { ref: string };
  const c = (await store.get(ref))!;
  await store.update(c.id, { state: 'solved', solvedAt: Date.now() });
  assert.equal((await post(`/${ref}/messages`, ME, { text: 'Not fixed' })).status, 200);
  assert.equal((await store.get(ref))?.state, 'waiting_us');
});
