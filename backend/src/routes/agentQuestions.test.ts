import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Hono } from 'hono';

/// Answering what an agent asked (view 41): only the owner answers, once; a
/// request question is answered with an offer, a counter question acts on
/// the counter, and "Not for me" clears the other side's "checking" line.
///
///   npx tsx --test src/routes/agentQuestions.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-agent-questions-route-')));
delete process.env.DATABASE_URL;

const { agentQuestionsRoutes, __agentQuestionsTest } = await import('./agentQuestions.js');
const { putQuestion, getQuestion } = await import('../db/agentQuestions.js');
const { bus } = await import('../events.js');

const SELLER = '0x00000000000000000000000000000000000000a1';
const OTHER = '0x00000000000000000000000000000000000000b2';
let caller: string | null = SELLER;
__agentQuestionsTest.setSession(() => caller);
const counterCalls: unknown[] = [];
__agentQuestionsTest.setCounterAnswer(async (jobId, sellerUser, answer) => {
  counterCalls.push({ jobId, sellerUser, answer });
  return { ok: true };
});

const app = new Hono().route('/api/agent-questions', agentQuestionsRoutes);
const post = (id: string, body: unknown) =>
  app.request(`/api/agent-questions/${id}/answer`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

const ask = (jobByte: string, kind: 'no-way' | 'counter-below-floor') =>
  putQuestion({
    owner: SELLER,
    side: 'seller',
    jobId: '0x' + jobByte.repeat(32),
    kind,
    title: 'Logo',
    facts: { budgetUsdc: '100', limit: 90, theirPriceUsdc: '85' },
    suggested: { priceUsdc: '90', days: 3 },
    mandateVersion: 1,
  });

test('signed out is refused; the owner lists their open questions', async () => {
  await ask('a1', 'no-way');
  caller = null;
  assert.equal((await app.request('/api/agent-questions')).status, 401);
  caller = SELLER;
  const body = (await (await app.request('/api/agent-questions')).json()) as { questions: unknown[] };
  assert.equal(body.questions.length, 1);
});

test('someone else cannot answer, and a request question is answered with the offer card', async () => {
  const q = await ask('a2', 'no-way');
  caller = OTHER;
  assert.equal((await post(q.id, { choice: 'yes' })).status, 404);
  caller = SELLER;
  const res = await post(q.id, { choice: 'change', priceUsdc: '95', days: 4 });
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { next: unknown }).next, { intent: 'make_offer', jobId: q.jobId, priceUsdc: '95', deliverInDays: 4 });
  assert.equal((await getQuestion(q.id))?.state, 'input-required', 'stays open until the offer is sent');
});

test('a counter question acts on the counter once; a second answer is refused', async () => {
  const q = await ask('a3', 'counter-below-floor');
  const res = await post(q.id, { choice: 'change' });
  assert.equal(res.status, 200);
  assert.deepEqual(counterCalls.at(-1), { jobId: q.jobId, sellerUser: SELLER, answer: { choice: 'change', priceUsdc: '90' } });
  assert.equal((await getQuestion(q.id))?.state, 'answered');
  assert.equal((await post(q.id, { choice: 'yes' })).status, 409);
});

test('"Not for me" closes the question', async () => {
  const q = await ask('a4', 'no-way');
  const seen: string[] = [];
  const off = bus.subscribe((e) => seen.push(e.type));
  try {
    assert.equal((await post(q.id, { choice: 'no' })).status, 200);
  } finally {
    off();
  }
  assert.equal((await getQuestion(q.id))?.state, 'answered');
});

test('change without a price is refused', async () => {
  const q = await ask('a5', 'no-way');
  assert.equal((await post(q.id, { choice: 'change' })).status, 400);
});
