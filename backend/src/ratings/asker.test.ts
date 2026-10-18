import assert from 'node:assert/strict';
import test from 'node:test';
import { createRatingAsker, type AskerDeps, type AskState, type RatingNotice } from './asker.js';
import type { DealRating } from './rules.js';

/// After a deal settles both people are asked to rate it, reminded once after
/// three days, and told when the other's rating of them shows.
///
///   npx tsx --test src/ratings/asker.test.ts

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SETTLED = 1_760_000_000_000;

function setup(settledAt: number | null = SETTLED) {
  let now = SETTLED + HOUR;
  const states = new Map<string, AskState>();
  const ratings: DealRating[] = [];
  const sent: RatingNotice[] = [];
  const deps: AskerDeps = {
    now: () => now,
    recentlySettled: async () => (settledAt === null ? [] : [{ jobId: 'd1', buyer: '0xb', seller: '0xs', settledAt }]),
    getDeal: async (id) => (id === 'd1' ? { jobId: 'd1', buyer: '0xb', seller: '0xs', settledAt } : null),
    getState: async (id) => states.get(id) ?? null,
    putState: async (id, s) => void states.set(id, s),
    ratingsForDeal: async () => ratings,
    tagOf: async (a) => (a === '0xb' ? 'bola' : 'ada'),
    notify: async (n) => void sent.push(n),
  };
  const rate = (rater: string, ratee: string) =>
    ratings.push({ dealId: 'd1', rater, ratee, stars: 5, note: null, noteHeld: false, settledAt: SETTLED, createdAt: now });
  return { asker: createRatingAsker(deps), sent, rate, advance: (ms: number) => (now += ms) };
}

test('a settled deal asks both identities once', async () => {
  const s = setup();
  await s.asker.sweep();
  await s.asker.sweep();
  assert.deepEqual(
    s.sent.map((n) => [n.kind, n.address, n.withTag]),
    [['requested', '0xb', 'ada'], ['requested', '0xs', 'bola']],
  );
  assert.equal(s.sent[0]!.text, 'How did your deal with @ada go? Rate it 1 to 5, and add a note if you like.');
});

test('a deal that has not settled asks no one', async () => {
  const s = setup(null);
  await s.asker.sweep();
  await s.asker.check('d1');
  assert.deepEqual(s.sent, []);
});

test('one reminder after three days, never two, and only to who has not rated', async () => {
  const s = setup();
  await s.asker.sweep();
  s.rate('0xb', '0xs');
  s.advance(2 * DAY);
  await s.asker.sweep();
  assert.equal(s.sent.filter((n) => n.kind === 'reminder').length, 0);
  s.advance(DAY + HOUR);
  await s.asker.sweep();
  s.advance(DAY);
  await s.asker.sweep();
  assert.deepEqual(s.sent.filter((n) => n.kind === 'reminder').map((n) => n.address), ['0xs']);
});

test('the reveal goes to both when the second rating lands', async () => {
  const s = setup();
  await s.asker.sweep();
  s.rate('0xb', '0xs');
  await s.asker.check('d1');
  assert.equal(s.sent.filter((n) => n.kind === 'revealed').length, 0);
  s.rate('0xs', '0xb');
  await s.asker.check('d1');
  await s.asker.check('d1');
  assert.deepEqual(
    s.sent.filter((n) => n.kind === 'revealed').map((n) => [n.address, n.text]),
    [['0xb', "@ada's rating of you is in."], ['0xs', "@bola's rating of you is in."]],
  );
});

test('after 14 days a single rating shows, and only the person rated is told', async () => {
  const s = setup();
  await s.asker.sweep();
  s.rate('0xb', '0xs');
  s.advance(14 * DAY);
  await s.asker.sweep();
  assert.deepEqual(s.sent.filter((n) => n.kind === 'revealed').map((n) => n.address), ['0xs']);
});

test('a deal settled more than three days before the first sweep is never newly asked, so a launch or restart floods no one', async () => {
  const s = setup();
  s.advance(4 * DAY);
  await s.asker.sweep();
  assert.deepEqual(s.sent.filter((n) => n.kind === 'requested'), []);
});
