import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/// An agent asks its person instead of going quiet (view 41): the person hears
/// on every channel with a suggested answer, the other side hears only that
/// someone is checking.
///
///   npx tsx --test src/agents/agentQuestion.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-agent-question-')));
delete process.env.DATABASE_URL;

const { askOwner, questionLine } = await import('./agentQuestion.js');
const { openQuestionsFor } = await import('../db/agentQuestions.js');
const { bus } = await import('../events.js');
const { recipientsFor, summaryFor } = await import('../telegram/notifier.js');
const { contentFor } = await import('../emails/dealNotifier.js');

const SELLER = '0x00000000000000000000000000000000000000a1';
const BUYER = '0x00000000000000000000000000000000000000b2';
const JOB = '0x' + 'ab'.repeat(32);

test('the shoe case: a seller with no way for goods is asked, and the buyer hears only that the seller is checking', async () => {
  const seen: Array<{ type: string; payload: Record<string, unknown> | undefined; jobId?: string }> = [];
  const off = bus.subscribe((e) => {
    if (e.type === 'agent.suggestion' || e.type === 'agent.question.waiting') seen.push(e);
  });
  try {
    await askOwner({
      owner: SELLER,
      side: 'seller',
      jobId: JOB,
      kind: 'no-way',
      title: '3 pairs of Clark shoes, size 44',
      budgetUsdc: '100',
      dueDays: 3,
      limit: null,
      suggested: { priceUsdc: '100', days: 3 },
      counterpartUser: BUYER,
    });
  } finally {
    off();
  }
  const [asked, waiting] = seen;
  assert.equal(asked?.type, 'agent.suggestion');
  assert.equal(asked?.jobId, undefined, 'a question never rides on the job id, so it never reaches the buyer');
  assert.equal(asked?.payload?.sellerUser, SELLER);
  assert.equal(asked?.payload?.kind, 'no-way');
  assert.equal(waiting?.type, 'agent.question.waiting');
  assert.deepEqual(waiting?.payload, { buyerUser: BUYER, jobId: JOB, checking: 'seller' });
  assert.equal((await openQuestionsFor(SELLER)).length, 1);
});

test('the question reaches the seller on Telegram and by email with the suggested answer, never the buyer', async () => {
  const e = {
    type: 'agent.suggestion', actor: 'seller', ts: 0,
    payload: { sellerUser: SELLER, jobId: JOB, questionId: 'q1', kind: 'price-below-floor', title: 'Logo', budgetUsdc: '12', dueDays: 3, limit: 20, priceUsdc: '20', days: 3 },
  } as never;
  assert.deepEqual(await recipientsFor(e), [{ address: SELLER, role: 'seller' }]);
  const tg = summaryFor(e, 'seller');
  assert.match(tg!.text, /Your agent has a question for you/);
  assert.match(tg!.text, /under your lowest of 20 USDC\. Offer 20 USDC\?/);
  const mail = contentFor(e, 'seller', 'service');
  assert.equal(mail?.subject, 'Your agent has a question for you');
  assert.equal(contentFor(e, 'buyer', 'service'), null);
});

test('a buyer-side question goes to the buyer only', async () => {
  const e = {
    type: 'agent.suggestion', actor: 'buyer', ts: 0,
    payload: { buyerUser: BUYER, jobId: JOB, questionId: 'q2', kind: 'price-above-cap', title: 'Logo', budgetUsdc: '100', limit: 110, theirPriceUsdc: '120', priceUsdc: '120', days: 3 },
  } as never;
  assert.deepEqual(await recipientsFor(e), [{ address: BUYER, role: 'buyer' }]);
  assert.equal(contentFor(e, 'seller', 'service'), null);
});

test('the lines never use an em dash and always end in a question the buttons answer', () => {
  for (const kind of ['no-way', 'price-below-floor', 'price-above-usual', 'time', 'ask-first', 'counter-below-floor', 'price-above-cap']) {
    const line = questionLine({ kind, budgetUsdc: '100', limit: 40, priceUsdc: '90', days: 3, dueDays: 2, theirPriceUsdc: '85' });
    assert.ok(line, kind);
    assert.doesNotMatch(line!, /—/);
    assert.match(line!, /\?$/);
  }
});
