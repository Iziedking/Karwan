import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/// The questions an agent asks its person instead of going quiet (view 41).
/// One open question per person and request; a newer one updates it.
///
///   npx tsx --test src/db/agentQuestions.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-agent-questions-')));
delete process.env.DATABASE_URL;

const { putQuestion, openQuestionsFor, getQuestion, answerQuestion, expireQuestionsForJob, dueReminders, markReminded } =
  await import('./agentQuestions.js');

const OWNER = '0x00000000000000000000000000000000000000A1';
const OTHER = '0x00000000000000000000000000000000000000b2';
const JOB = '0x' + 'ab'.repeat(32);
/// Times are offsets from now: a question older than 24 hours is closed.
const T = Date.now();

const base = {
  owner: OWNER,
  side: 'seller' as const,
  jobId: JOB,
  kind: 'no-way' as const,
  title: '3 pairs of Clark shoes',
  facts: { budgetUsdc: '100', quantity: { count: 3, unit: 'pairs' } },
  suggested: { priceUsdc: '96', days: 3 },
  mandateVersion: 1,
};

test('one open question per person and request; a newer one updates it and keeps the id', async () => {
  const first = await putQuestion({ ...base, now: T + 1_000 });
  const again = await putQuestion({ ...base, kind: 'price-below-floor', suggested: { priceUsdc: '90' }, now: T + 2_000 });
  assert.equal(again.id, first.id);
  assert.equal(again.kind, 'price-below-floor');
  assert.equal(again.suggested.priceUsdc, '90');
  assert.equal(again.createdAt, T + 1_000);
  const open = await openQuestionsFor(OWNER.toLowerCase());
  assert.equal(open.length, 1);
  assert.equal(open[0]!.owner, OWNER.toLowerCase());
  assert.equal(open[0]!.state, 'input-required');
});

test('an answer closes the question once; a second answer is refused', async () => {
  const q = (await openQuestionsFor(OWNER))[0]!;
  const done = await answerQuestion(q.id, OWNER, { choice: 'change', priceUsdc: '92' }, T + 3_000);
  assert.equal(done?.state, 'answered');
  assert.deepEqual(done?.answer, { choice: 'change', priceUsdc: '92' });
  assert.equal(await answerQuestion(q.id, OWNER, { choice: 'no' }, T + 3_100), null);
  assert.equal((await openQuestionsFor(OWNER)).length, 0);
});

test('only the owner can answer', async () => {
  const q = await putQuestion({ ...base, jobId: '0x' + 'cd'.repeat(32), now: T + 4_000 });
  assert.equal(await answerQuestion(q.id, OTHER, { choice: 'yes' }, T + 4_100), null);
  assert.equal((await getQuestion(q.id))?.state, 'input-required');
});

test('closing a request expires its open questions; questions past 24 hours expire too', async () => {
  const job = '0x' + 'ef'.repeat(32);
  await putQuestion({ ...base, jobId: job, now: T + 5_000 });
  assert.equal(await expireQuestionsForJob(job, T + 5_100), 1);
  assert.equal((await openQuestionsFor(OWNER)).some((q) => q.jobId === job), false);

  const old = await putQuestion({ ...base, jobId: '0x' + '12'.repeat(32), now: T + 10_000 });
  const listedLater = await openQuestionsFor(OWNER, T + 10_000 + 24 * 3_600_000 + 1);
  assert.equal(listedLater.some((q) => q.id === old.id), false);
});

test('a reminder is due once, 30 minutes before the default runs, and never after an answer (view 52)', async () => {
  const q = await putQuestion({ ...base, jobId: '0x' + '34'.repeat(32), now: T + 20_000 });
  const decideAt = q.decideAt!;
  assert.equal(decideAt, T + 20_000 + 24 * 3_600_000);
  assert.equal((await dueReminders(T + 20_000 + 31 * 60_000)).some((r) => r.id === q.id), false);
  assert.equal((await dueReminders(decideAt - 31 * 60_000)).some((r) => r.id === q.id), false);
  assert.equal((await dueReminders(decideAt - 29 * 60_000)).some((r) => r.id === q.id), true);
  await markReminded(q.id, decideAt - 29 * 60_000);
  assert.equal((await dueReminders(decideAt - 10 * 60_000)).some((r) => r.id === q.id), false);
});

test('every question but the near match says no by default, decided a day on or when the request closes (view 52)', async () => {
  const { defaultFor, decideAtFor } = await import('./agentQuestions.js');
  for (const kind of ['price-below-floor', 'time', 'ask-first', 'no-way', 'counter-below-floor'] as const) assert.equal(defaultFor(kind), 'no');
  assert.equal(defaultFor('price-above-cap'), null);
  assert.equal(decideAtFor(1_000), 1_000 + 24 * 3_600_000);
  assert.equal(decideAtFor(1_000, 5_000), 5_000);
  assert.equal(decideAtFor(1_000, 500), 1_000 + 24 * 3_600_000);
  const q = await putQuestion({ ...base, jobId: '0x' + '56'.repeat(32), closesAt: T + 60_000 + 3_600_000, now: T + 60_000 });
  assert.equal(q.defaultChoice, 'no');
  assert.equal(q.decideAt, T + 60_000 + 3_600_000);
});

test('the default runs once, even across two sweeps or a restart, and never after an answer (view 52)', async () => {
  const { dueDefaults, decideByDefault } = await import('./agentQuestions.js');
  const q = await putQuestion({ ...base, jobId: '0x' + '78'.repeat(32), now: T + 70_000 });
  assert.equal((await dueDefaults(q.decideAt! - 1)).some((d) => d.id === q.id), false);
  assert.equal((await dueDefaults(q.decideAt!)).some((d) => d.id === q.id), true);
  const first = await decideByDefault(q.id, q.decideAt!);
  assert.deepEqual(first?.answer, { choice: 'no', by: 'default' });
  assert.equal(await decideByDefault(q.id, q.decideAt! + 1), null);
  assert.equal((await dueDefaults(q.decideAt! + 60_000)).some((d) => d.id === q.id), false);

  const answered = await putQuestion({ ...base, jobId: '0x' + '9a'.repeat(32), now: T + 80_000 });
  await answerQuestion(answered.id, OWNER, { choice: 'yes' }, T + 81_000);
  assert.equal(await decideByDefault(answered.id, answered.decideAt!), null);
});
