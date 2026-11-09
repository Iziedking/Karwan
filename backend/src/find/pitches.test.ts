import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { answerPitch } from './answers.js';
import { contactOf, createContact, markPitchOffered, markPitchPosted, pitchByJob, resetContactsForTests, type Contact } from './contacts.js';
import { DAY_MS } from './limits.js';
import { ownerView, resetFindsForTests, saveFind, type Find } from './finds.js';
import { pitchNote, pitchPicked, placePitchOffer, sendPitchDue, type PitchDeps, type PlaceDeps } from './pitches.js';
import type { LeadRow } from './rankBuyers.js';

/// Pitches (view 72, Phase 4): a seller offers to help buyers who let sellers
/// reach them; limits hold in the store; interested turns the pitch into the
/// seller's offer on a private request; nothing is ever funded by it.

beforeEach(() => {
  resetContactsForTests();
  resetFindsForTests();
});

const NOW = Date.UTC(2026, 10, 9, 9);
const lead = (ref: string, buyer: string, over: Partial<LeadRow> = {}): LeadRow => ({
  kind: 'need', ref, buyer, what: 'Lunch for 20 every Friday', budgetUsdc: '40', every: 'week', deliveryKind: 'in_person',
  dueDays: null, distance: { key: 'about', km: 3 }, buyerVerified: false, buyerTier: 'ESTABLISHED', ...over,
});
const sellerFind = (owner: string, leads: LeadRow[], id = `find-${owner}`): Find => ({
  id, owner, side: 'seller', mode: 'choose', need: 'Buyers for what I sell', budgetUsdc: '0', kind: 'remote', where: { scope: 'anywhere' },
  jobId: null, needId: null, rows: [], leads, status: 'shortlisted', createdAt: NOW, endsAt: NOW + 7 * DAY_MS,
});
const OFFER = { priceUsdc: '33.43', days: 2, note: '' };

function deps(over: Partial<PitchDeps> = {}) {
  const notes: Array<{ to: string; heading: string; lines: string[]; pitchId: string }> = [];
  let n = 0;
  const d: PitchDeps = {
    create: createContact,
    firstDue: () => async (sentAt) => sentAt + DAY_MS,
    saveFind,
    locale: async (p) => (p === '0xfr' ? 'fr' : 'en'),
    money: async (p, usdc) => (p === '0xfr' ? `${usdc} €` : `₦${Math.round(usdc * 1346).toLocaleString('en')}`),
    seller: async () => ({ name: 'Chef Bisi', verified: true, stars: 4.8 }),
    note: (to, data) => void notes.push({ to, ...data }),
    newId: () => `pitch-${++n}`,
    ...over,
  };
  return { d, notes };
}

test('the buyer is told in their own language and money, with how far, never where or who they are to the seller', async () => {
  const { d, notes } = deps();
  const find = sellerFind('0xchef', [lead('n1', '0xrestaurant'), lead('n2', '0xfr')]);
  const out = await pitchPicked({ find, picks: [0, 1, 1], offer: OFFER }, NOW, d);
  assert.deepEqual(out, { pitched: 2, refused: [] });
  assert.deepEqual(notes[0], {
    to: '0xrestaurant', pitchId: 'pitch-1', heading: 'Someone near you can help with what you need',
    lines: ['"Lunch for 20 every Friday"', 'Chef Bisi offers ₦44,997, ready in 2 days', 'Verified · Rated 4.8', 'About 3 km from you', 'Open it to answer: interested, not now, or not interested.'],
  });
  assert.match(notes[1]!.heading, /Quelqu'un près de chez vous/);
  assert.match(notes[1]!.lines[1]!, /33.43 €/);
});

test('the days read right in Arabic: one, two, three to ten, eleven and up', async () => {
  const seller = { name: 'Bisi', verified: false, stars: null };
  const line = async (days: number) =>
    (await pitchNote(
      { to: '0xar', what: 'Lunch', kind: 'remote', distance: { key: 'about', km: 3 }, seller, offer: { priceUsdc: '10', days, note: '' }, reminder: false },
      { locale: async () => 'ar', money: async () => '10 USDC' },
    )).lines[1];
  assert.equal(await line(1), 'Bisi يعرض 10 USDC، جاهز خلال يوم واحد');
  assert.equal(await line(2), 'Bisi يعرض 10 USDC، جاهز خلال يومين');
  assert.equal(await line(7), 'Bisi يعرض 10 USDC، جاهز خلال 7 أيام');
  assert.equal(await line(14), 'Bisi يعرض 10 USDC، جاهز خلال 14 يومًا');
});

test('one pitch per seller per need, and an open request is offered on, never pitched', async () => {
  const { d, notes } = deps();
  const find = sellerFind('0xchef', [lead('n1', '0xrestaurant'), lead('0xjob', '0xshop', { kind: 'request' })]);
  await pitchPicked({ find, picks: [0], offer: OFFER }, NOW, d);
  const again = await pitchPicked({ find, picks: [0, 1], offer: OFFER }, NOW + 1_000, d);
  assert.deepEqual(again.refused.map((r) => r.reason), ['already_contacted', 'not_a_need']);
  assert.equal(notes.length, 1);
});

test('a buyer gets at most three pitches a day for one need', async () => {
  const { d } = deps();
  const results = [];
  for (const s of ['0xa', '0xb', '0xc', '0xd']) results.push(await pitchPicked({ find: sellerFind(s, [lead('n1', '0xrestaurant')]), picks: [0], offer: OFFER }, NOW, d));
  assert.deepEqual(results.map((r) => r.pitched), [1, 1, 1, 0]);
  assert.equal(results[3]!.refused[0]!.reason, 'buyer_pitch_daily');
});

test('not interested stops that seller for that need for good; not now for 30 days', async () => {
  const { d } = deps();
  const find = sellerFind('0xchef', [lead('n1', '0xrestaurant'), lead('n2', '0xcafe')]);
  await pitchPicked({ find, picks: [0, 1], offer: OFFER }, NOW, d);
  assert.equal(await answerPitch('0xrestaurant', 'pitch-1', 'no', NOW + 1), 'answered');
  assert.equal(await answerPitch('0xcafe', 'pitch-2', 'not_now', NOW + 1), 'answered');
  assert.equal(await answerPitch('0xsomeoneelse', 'pitch-1', 'no', NOW + 1), 'none');
  const soon = await pitchPicked({ find, picks: [1], offer: OFFER }, NOW + 10 * DAY_MS, d);
  assert.deepEqual(soon.refused.map((r) => r.reason), ['not_now']);
  const later = await pitchPicked({ find, picks: [0, 1], offer: OFFER }, NOW + 40 * DAY_MS, d);
  assert.deepEqual(later.refused.map((r) => r.reason), ['not_interested']);
  assert.equal(later.pitched, 1);
});

test('the reminder goes the next morning, from the same pitch', async () => {
  const { d, notes } = deps();
  const find = sellerFind('0xchef', [lead('n1', '0xrestaurant')]);
  await saveFind(find);
  await pitchPicked({ find, picks: [0], offer: OFFER }, NOW, d);
  const c = (await contactOf('pitch-1'))!;
  await sendPitchDue({ contact: c, step: 'remind' }, find, d);
  assert.equal(notes[1]!.heading, 'Reminder: someone near you can help with what you need');
  assert.equal(notes[1]!.pitchId, 'pitch-1');
});

test('interested: only the buyer marks it, once, and the offer goes on the request once it is tracked', async () => {
  const { d } = deps();
  await pitchPicked({ find: sellerFind('0xchef', [lead('n1', '0xrestaurant')]), picks: [0], offer: OFFER }, NOW, d);
  assert.equal(await markPitchPosted('pitch-1', '0xchef', '0xJOB', NOW), null);
  assert.ok(await markPitchPosted('pitch-1', '0xrestaurant', '0xJOB', NOW));
  assert.equal(await markPitchPosted('pitch-1', '0xrestaurant', '0xjob2', NOW), null);
  const pitch = (await pitchByJob('0xjob')) as Contact;
  assert.equal(pitch.answer, 'interested');

  const calls: string[] = [];
  const offers: Array<{ seller: string; jobId: string; priceUsdc: string; deliverByUnix: number }> = [];
  let deadline: number | null = null;
  const place: PlaceDeps = {
    offer: async (seller, jobId, input) => {
      calls.push('offer');
      offers.push({ seller, jobId, ...input });
      return { ok: true };
    },
    markOffered: markPitchOffered,
    deadlineOf: () => deadline,
    noteSeller: async () => void calls.push('noteSeller'),
  };
  const nowSec = NOW / 1000;
  assert.equal(await placePitchOffer(pitch, nowSec, place), 'waiting');
  deadline = nowSec + 5 * 86_400;
  assert.equal(await placePitchOffer(pitch, nowSec, place), 'placed');
  assert.equal(await placePitchOffer((await pitchByJob('0xjob'))!, nowSec, place), 'done');
  assert.deepEqual(offers, [{ seller: '0xchef', jobId: '0xjob', priceUsdc: '33.43', deliverByUnix: nowSec + 2 * 86_400, note: '' }]);
  // Nothing funds: the only money step a pitch takes is an offer the buyer still accepts.
  assert.deepEqual(calls, ['offer', 'noteSeller']);
});

test("a seller's own find never shows who the buyers are", () => {
  const view = ownerView(sellerFind('0xchef', [lead('n1', '0xrestaurant')], 'f1'), new Map(), new Map(), new Set(['n1']));
  assert.doesNotMatch(JSON.stringify(view), /0xrestaurant|0xchef/);
  assert.equal(view.leads![0]!.pitched, true);
});
