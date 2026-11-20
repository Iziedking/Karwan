import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryProgressStore } from '../db/agentProgress.js';
import type { AgentRecord } from './agentRecord.js';
import { composeBrief } from './brief.js';
import { FITS_PER_DAY, PASSES_SENT_PER_DAY, fitKey, heldFits, tellFit, type FitDeps, type FitInput } from './fitAlert.js';
import type { PersonEvent } from './personAgent.js';

/// One fit path for every open trade (view 96): told once, held in quiet hours
/// and past the day's cap, never dropped.

const ADA = '0x3333333333333333333333333333333333333333';
// 20 Nov 2026 12:00 in Lagos.
const NOON = Date.UTC(2026, 10, 20, 11, 0, 0);

function setup(o: { now?: number; quiet?: AgentRecord['quiet'] } = {}) {
  const progress = memoryProgressStore();
  const sent: PersonEvent[] = [];
  let now = o.now ?? NOON;
  const deps: FitDeps = {
    now: () => now,
    progress,
    recordFor: async () => ({ owner: ADA, brief: { on: true, hour: 8, timeZone: 'Africa/Lagos' }, ...(o.quiet !== undefined ? { quiet: o.quiet } : {}) }) as AgentRecord,
    locale: async () => 'en',
    money: async (_o, usdc) => `₦${(usdc * 1343).toLocaleString('en-GB')}`,
    emit: (e) => sent.push(e),
  };
  return { deps, progress, sent, at: (t: number) => { now = t; } };
}

const request = (n: number, over: Partial<FitInput> = {}): FitInput => ({
  to: ADA, kind: 'request', ref: `0x${String(n).padStart(64, '0')}`, what: 'fits', facts: { title: `Logo ${n}`, amountUsdc: 45 }, jobId: `0x${String(n).padStart(64, '0')}`, ...over,
});

test('a fit is told once, in the person\'s money, opening its own page', async () => {
  const { deps, sent } = setup();
  assert.equal(await tellFit(deps, request(1)), 'sent');
  assert.equal(await tellFit(deps, request(1)), 'told', 'the same thing is never told twice');
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.type, 'agent.note');
  assert.equal(sent[0]!.data.heading, 'Something fits you');
  assert.deepEqual(sent[0]!.data.lines, ['"Logo 1" fits your work. Budget ₦60,435.']);
  assert.equal(sent[0]!.data.jobId, request(1).jobId);
});

test('a contest, work and an offer each say what they are and open by path', async () => {
  const { deps, sent } = setup();
  await tellFit(deps, { to: ADA, kind: 'contest', ref: 'c_1', what: 'fits', facts: { title: 'Best logo', amountUsdc: 300, winners: 2, closesAt: Date.UTC(2026, 10, 27) }, path: '/contests/c_1' });
  await tellFit(deps, { to: ADA, kind: 'work', ref: 'wr_1', what: 'offered', facts: { title: 'Bookkeeping', amountUsdc: 9, per: 'hour' }, path: '/work/requests/wr_1' });
  await tellFit(deps, { to: ADA, kind: 'offer', ref: 'l_1', what: 'fits', facts: { title: 'iPhone 13', amountUsdc: 310 }, path: '/listings/l_1' });
  assert.deepEqual(sent.map((e) => e.data.lines[0]), [
    'A contest fits your work: "Best logo". Prize ₦402,900 for 2. Entries close 27 Nov.',
    'Your agent offered ₦12,087 an hour on "Bookkeeping". You can change or withdraw it.',
    '"iPhone 13" fits what you asked for. ₦416,330.',
  ]);
  assert.deepEqual(sent.map((e) => (e.data as { path?: string }).path), ['/contests/c_1', '/work/requests/wr_1', '/listings/l_1']);
});

test('a pass says why in one line and how to offer by hand; it never names the buyer', async () => {
  const { deps, sent } = setup();
  await tellFit(deps, request(2, { what: 'passed', reason: 'under-lowest' }));
  assert.deepEqual(sent[0]!.data.lines, ['Your agent did not offer on "Logo 2".', 'The budget is under your lowest price.', 'Open it to offer yourself.']);
});

test('in quiet hours a fit waits for the brief, and the brief names it', async () => {
  const { deps, sent, progress } = setup({ now: Date.UTC(2026, 10, 20, 22, 0, 0) });
  assert.equal(await tellFit(deps, request(3)), 'held');
  assert.equal(sent.length, 0);
  assert.equal(await tellFit(deps, request(3)), 'told', 'held is still told once');
  const held = heldFits(await progress.toldSince(ADA, 0), 0);
  assert.deepEqual(held.map((h) => h.title), ['Logo 3']);
  const brief = composeBrief({ timeZone: 'Africa/Lagos', newOffers: [], questions: { count: 0, firstDecideAt: null }, dealsWaiting: 0, insights: [], insightsAllowed: 0, goals: [], told: [], fits: held });
  assert.deepEqual(brief?.lines, ['1 more fit you: Logo 3']);
});

test('past eight fits a day the rest wait for the brief; passes have their own three', async () => {
  const { deps, sent } = setup({ quiet: null });
  const results = [];
  for (let n = 10; n < 10 + FITS_PER_DAY + 2; n += 1) results.push(await tellFit(deps, request(n)));
  assert.deepEqual(results, [...Array(FITS_PER_DAY).fill('sent'), 'held', 'held']);
  const passes = [];
  for (let n = 30; n < 30 + PASSES_SENT_PER_DAY + 1; n += 1) passes.push(await tellFit(deps, request(n, { what: 'passed', reason: 'weekly-limit' })));
  assert.deepEqual(passes, [...Array(PASSES_SENT_PER_DAY).fill('sent'), 'held'], 'passes do not count toward the fits cap, and have a cap of their own');
  assert.equal(sent.length, FITS_PER_DAY + PASSES_SENT_PER_DAY);
});

test('the cap starts again the next day where the person is', async () => {
  const { deps, at } = setup({ quiet: null });
  for (let n = 50; n < 50 + FITS_PER_DAY; n += 1) await tellFit(deps, request(n));
  assert.equal(await tellFit(deps, request(70)), 'held');
  at(NOON + 24 * 3_600_000);
  assert.equal(await tellFit(deps, request(71)), 'sent');
});

test('a contest reminder is its own thing, told once', async () => {
  const { deps, sent } = setup();
  const base = { to: ADA, kind: 'contest' as const, ref: 'c_9', facts: { title: 'Flyer', amountUsdc: 50 }, path: '/contests/c_9' };
  assert.equal(fitKey({ ...base, what: 'reminder' }), 'contest:c_9:reminder');
  assert.equal(await tellFit(deps, { ...base, what: 'fits' }), 'sent');
  assert.equal(await tellFit(deps, { ...base, what: 'reminder' }), 'sent');
  assert.equal(await tellFit(deps, { ...base, what: 'reminder' }), 'told');
  assert.equal(sent[1]!.data.lines[0], '"Flyer" closes for entries in a day. Prize ₦67,150.');
});

test('the brief names at most five held fits, newest first', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ kind: 'fit', at: i, data: { in: 'brief', title: `T${i}` } }));
  const held = heldFits([...rows, { kind: 'fit', at: 99, data: { in: 'note', title: 'sent already' } }], 0);
  const brief = composeBrief({ timeZone: 'UTC', newOffers: [], questions: { count: 0, firstDecideAt: null }, dealsWaiting: 0, insights: [], insightsAllowed: 0, goals: [], told: [], fits: held });
  assert.deepEqual(brief?.lines, ['7 more fit you: T6, T5, T4, T3, T2']);
});
