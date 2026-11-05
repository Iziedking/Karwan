import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// Questions that land (view 52, step 2): every question says what happens
/// without an answer and by when; that default runs once, the person is told,
/// and it all goes out on one channel.
///
///   npx tsx --test src/agents/questionSweep.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-question-sweep-')));
delete process.env.DATABASE_URL;

const { putQuestion, decideByDefault, dueDefaults } = await import('../db/agentQuestions.js');
const { runDefaults } = await import('./questionSweep.js');
const { defaultLine, decidedLine, decideTime } = await import('./agentQuestion.js');
const { questionChannelFor } = await import('../channels/notifyVia.js');
type Emitted = { type: string; payload?: Record<string, unknown> };

const SELLER = '0x00000000000000000000000000000000000000d4';
const ask = (jobByte: string, kind: 'price-below-floor' | 'counter-below-floor' | 'price-above-cap', now: number) =>
  putQuestion({
    owner: SELLER, side: kind === 'price-above-cap' ? 'buyer' : 'seller', jobId: '0x' + jobByte.repeat(32), kind, title: 'Logo',
    facts: { budgetUsdc: '70', limit: 80 }, suggested: { priceUsdc: '80' }, mandateVersion: 1, now,
  });

function deps(counterNo: string[] = [], emitted: Emitted[] = []) {
  return {
    counterNo,
    emitted,
    deps: {
      due: (now: number) => dueDefaults(now),
      decide: (id: string, now: number) => decideByDefault(id, now),
      counterNo: async (jobId: string) => { counterNo.push(jobId); },
      emit: (e: Emitted) => { emitted.push(e); },
    },
  };
}

test('at the decide time the default runs once, the person is told, and a second sweep does nothing', async () => {
  const t = Date.UTC(2026, 10, 6, 12);
  const q = await ask('e1', 'price-below-floor', t);
  const h = deps();
  assert.equal(await runDefaults(q.decideAt! - 1, h.deps as never), 0);
  assert.equal(await runDefaults(q.decideAt!, h.deps as never), 1);
  assert.equal(await runDefaults(q.decideAt! + 60_000, h.deps as never), 0);
  const told = h.emitted.filter((e) => e.type === 'agent.question.decided');
  assert.equal(told.length, 1);
  assert.equal(told[0]!.payload?.sellerUser, SELLER);
  assert.equal(told[0]!.payload?.choice, 'no');
  assert.deepEqual(h.counterNo, []);
});

test('a counter question that runs out ends the negotiation the way pressing No does', async () => {
  const t = Date.UTC(2026, 10, 6, 13);
  const q = await ask('e2', 'counter-below-floor', t);
  const h = deps();
  await runDefaults(q.decideAt!, h.deps as never);
  assert.deepEqual(h.counterNo, [q.jobId]);
});

test('the buyer near match keeps its own card: no default runs for it', async () => {
  const t = Date.UTC(2026, 10, 6, 14);
  const q = await ask('e3', 'price-above-cap', t);
  assert.equal(q.defaultChoice, null);
  const h = deps();
  assert.equal(await runDefaults(t + 2 * 86_400_000, h.deps as never), 0);
});

test('every question says what happens without an answer, and by when', () => {
  const at = Date.UTC(2026, 10, 6, 18);
  assert.equal(decideTime(at), '6 Nov, 18:00 UTC');
  assert.equal(defaultLine({ defaultChoice: 'no', decideAt: at }), "If you don't answer by 6 Nov, 18:00 UTC, your agent will decline politely.");
  assert.equal(defaultLine({ kind: 'price-above-cap' }), null);
  assert.equal(decidedLine({ title: 'Logo' }), "You didn't answer about Logo, so your agent declined politely. You can still make an offer from the request page.");
});

test('one channel: what the person chose, and Telegram when they chose both and linked it', () => {
  assert.deepEqual(questionChannelFor({ notifyVia: 'both' }, true), { email: false, telegram: true });
  assert.deepEqual(questionChannelFor({ notifyVia: 'both' }, false), { email: true, telegram: false });
  assert.deepEqual(questionChannelFor(undefined, true), { email: false, telegram: true });
  assert.deepEqual(questionChannelFor({ notifyVia: 'email' }, true), { email: true, telegram: false });
  assert.deepEqual(questionChannelFor({ notifyVia: 'telegram' }, true), { email: false, telegram: true });
});
