import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { PrivateLocation } from '../location/rules.js';
import { alertPicked, type AlertDeps } from './alerts.js';
import { resetBlocksForTests } from './blocks.js';
import { answerContact, closeContactsOfFind, contactsOfFind, createContact, resetContactsForTests } from './contacts.js';
import { findById, resetFindsForTests, saveFind, type Find } from './finds.js';
import { newOrder, validateOrder, type OrderInput, type StandingOrder } from './orders.js';
import { runOrder, type RunDeps } from './orderRun.js';
import { pitchPicked, type PitchDeps } from './pitches.js';
import type { FindCandidate } from './rank.js';
import type { LeadCandidate, LeadSeller } from './rankBuyers.js';

/// One run of a standing order (view 87, step 4). Finds and contacts are the
/// real memory stores, so view 72's limits are the real ones.
///
///   node ../scripts/run-tests.mjs src/find/orderRun.test.ts

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 16, 12);
const LAGOS: PrivateLocation = { country: 'NG', city: 'Lagos', area: 'Yaba', reach: {}, point: { lat: 6.51, lng: 3.37, precision: 'area', source: 'typed', at: 0 } };

beforeEach(() => {
  resetContactsForTests();
  resetFindsForTests();
  resetBlocksForTests();
});

const seller = (name: string, over: Partial<FindCandidate> = {}): FindCandidate => ({
  user: `0x${name.toLowerCase()}`, sellerAgent: `0x${name.toLowerCase()}agent`, name, tag: name.toLowerCase(), words: ['rice', 'bag', 'grain'],
  meet: { atMyPlace: true, comeToYouKm: 20, online: true }, location: LAGOS, verified: true, tier: 'ESTABLISHED', rating: { kind: 'rated', value: 4.8, count: 12, disputed: 0 },
  price: { min: 30, usual: 35 }, days: { min: 1, max: 2 }, onTimeRate: 95, completed: 12, disputesLost: 0, contactFrom: 'anyone', outsideAgents: false, ...over,
});
const FIVE = ['Ngozi', 'Amaka', 'Tunde', 'Bola', 'Chidi'].map((n) => seller(n));

function order(input: Partial<OrderInput> = {}, over: Partial<StandingOrder> = {}): StandingOrder {
  const v = validateOrder({ side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: 40, kind: 'goods', ...input }, 0, NOW);
  assert.ok(v.ok);
  return { ...newOrder('0xbuyer', v.order, 'o1', NOW, 12, '2026-11-16'), ...over };
}

interface World {
  deps: RunDeps;
  posts: Array<{ need: string; budgetUsdc: string; invited: string[]; agreeForMe: boolean }>;
  invites: Array<{ jobId: string; people: string[] }>;
  notes: string[];
  state: { people: FindCandidate[]; canWork: boolean; agree: boolean; request: 'open' | 'locked' | 'ended'; post: 'ok' | 'short' | 'failed'; location: PrivateLocation | null;
    way: { priceUsdc: string; days: number } | null; leads: LeadCandidate[]; lead: LeadSeller | null; alertFails: boolean };
}

function world(): World {
  let ids = 0;
  const w: World = {
    posts: [], invites: [], notes: [],
    state: { people: FIVE, canWork: true, agree: false, request: 'open', post: 'ok', location: LAGOS, way: { priceUsdc: '35', days: 2 }, leads: [], lead: null, alertFails: false },
    deps: null as unknown as RunDeps,
  };
  const newId = () => `id-${++ids}`;
  const pitchedBy = new Map<string, string[]>();
  const alertDeps: AlertDeps = {
    create: createContact,
    firstDue: () => async (sentAt) => sentAt + 2 * HOUR,
    saveFind,
    locale: async () => 'en',
    money: async (_p, usdc) => `${usdc} USDC`,
    note: (to) => void w.notes.push(to),
    newId,
  };
  const pitchDeps: PitchDeps = {
    create: createContact,
    firstDue: () => async (sentAt) => sentAt + DAY,
    saveFind,
    locale: async () => 'en',
    money: async (_p, usdc) => `${usdc} USDC`,
    seller: async () => ({ name: 'Ada', verified: true, stars: 4.9 }),
    note: (to) => void w.notes.push(to),
    newId,
  };
  w.deps = {
    canWork: async () => w.state.canWork,
    day: async (_o, now) => new Date(now).toISOString().slice(0, 10),
    buyer: async () => ({ location: w.state.location, verified: true }),
    people: async () => w.state.people,
    blocked: async () => new Set(),
    cleanRecordCounts: true,
    saveFind,
    findById,
    contactsOfFind,
    agreeOn: async () => w.state.agree,
    post: async ({ find, invited, agreeForMe }) => {
      if (w.state.post !== 'ok') return { ok: false, code: w.state.post };
      w.posts.push({ need: find.need, budgetUsdc: find.budgetUsdc, invited, agreeForMe });
      return { ok: true, jobId: `0xjob${w.posts.length}` };
    },
    invite: async (jobId, people) => void w.invites.push({ jobId, people }),
    alert: async (input, now) => {
      if (w.state.alertFails) throw new Error('alerts down');
      return alertPicked({ ...input, byDay: null }, now, alertDeps);
    },
    requestState: async () => w.state.request,
    customers: async () => ({ seller: w.state.lead, leads: w.state.leads }),
    pitched: async (owner) => new Set(pitchedBy.get(owner) ?? []),
    sellWay: async () => w.state.way,
    pitch: async (input, now) => {
      const out = await pitchPicked(input, now, pitchDeps);
      const mine = pitchedBy.get(input.find.owner) ?? [];
      pitchedBy.set(input.find.owner, [...mine, ...input.picks.map((i) => input.find.leads![i]!.ref)]);
      return out;
    },
    newId,
  };
  return w;
}

test('a need in Hausa or Arabic is searched by its own words', async () => {
  const w = world();
  w.state.agree = true;
  const seen: string[][] = [];
  const people = w.deps.people;
  w.deps.people = async (q) => { seen.push(q.keywords); return people(q); };
  await runOrder(w.deps, order({ need: 'Ɗinkin babbar riga خياطة' }), NOW);
  assert.deepEqual(seen[0], ['ɗinkin', 'babbar', 'riga', 'خياطة']);
});

test('past its date an order ends and sends nothing', async () => {
  const w = world();
  const r = await runOrder(w.deps, order({ until: NOW + DAY }), NOW + DAY);
  assert.deepEqual(r.outcome, { kind: 'ended', why: 'date' });
  assert.equal(r.order.state, 'ended');
  assert.equal(r.order.endedAt, NOW + DAY);
  assert.equal(w.posts.length, 0);
});

test('an agent that is off, stopped or has Find people off does nothing', async () => {
  const w = world();
  w.state.canWork = false;
  const r = await runOrder(w.deps, order(), NOW);
  assert.deepEqual(r.outcome, { kind: 'off' });
  assert.equal(w.posts.length, 0);
  assert.equal(w.notes.length, 0);
});

test('the first run posts the need privately to the best three and asks them', async () => {
  const w = world();
  w.state.agree = true;
  const r = await runOrder(w.deps, order(), NOW);
  assert.deepEqual(r.outcome, { kind: 'asked', n: 3, names: ['Ngozi', 'Amaka', 'Tunde'] });
  assert.deepEqual(w.posts, [{ need: 'A 50kg bag of rice', budgetUsdc: '40', invited: ['0xngozi', '0xamaka', '0xtunde'], agreeForMe: true }]);
  assert.deepEqual(w.notes, ['0xngozi', '0xamaka', '0xtunde']);
  assert.equal(r.order.jobId, '0xjob1');
  assert.deepEqual(r.order.today, { day: '2026-11-16', asked: 3 });
  assert.equal(r.order.week.asked, 3);
  const find = await findById(r.order.findId!);
  assert.equal(find?.jobId, '0xjob1');
  assert.equal(find?.status, 'contacting');
});

test('people a day lower than three asks that many', async () => {
  const w = world();
  const r = await runOrder(w.deps, order({ perDay: 1 }), NOW);
  assert.deepEqual(r.outcome, { kind: 'asked', n: 1, names: ['Ngozi'] });
  assert.deepEqual(w.posts[0]!.invited, ['0xngozi']);
});

test('the next day asks only those not yet asked, and only while fewer than three wait for an answer', async () => {
  const w = world();
  const first = await runOrder(w.deps, order(), NOW);
  const waiting = await runOrder(w.deps, first.order, NOW + DAY);
  assert.deepEqual(waiting.outcome, { kind: 'waiting' });

  const contacts = await contactsOfFind(first.order.findId!);
  await answerContact(contacts[0]!.id, '0xngozi', 'no', NOW + DAY);
  await answerContact(contacts[1]!.id, '0xamaka', 'interested', NOW + DAY);
  const second = await runOrder(w.deps, first.order, NOW + DAY);
  assert.deepEqual(second.outcome, { kind: 'asked', n: 2, names: ['Bola', 'Chidi'] });
  assert.deepEqual(w.invites, [{ jobId: '0xjob1', people: ['0xbola', '0xchidi'] }]);
  assert.equal(w.posts.length, 1, 'one private request stays open');
  assert.deepEqual(second.order.today, { day: '2026-11-17', asked: 2 });
  assert.equal(second.order.week.asked, 5);
});

test('when the whole list was asked it looks for people who were not', async () => {
  const w = world();
  w.state.people = FIVE.slice(0, 2);
  const first = await runOrder(w.deps, order(), NOW);
  assert.equal(first.outcome.kind, 'asked');
  for (const c of await contactsOfFind(first.order.findId!)) await answerContact(c.id, c.to, 'no', NOW + HOUR);

  const none = await runOrder(w.deps, first.order, NOW + DAY);
  assert.deepEqual(none.outcome, { kind: 'nobody', days: 1 });

  w.state.people = [...FIVE.slice(0, 2), seller('Zainab')];
  const more = await runOrder(w.deps, none.order, NOW + 2 * DAY);
  assert.deepEqual(more.outcome, { kind: 'asked', n: 1, names: ['Zainab'] });
  assert.equal(more.order.emptyRuns, 0);
  assert.equal((await findById(first.order.findId!))?.rows.length, 3);
});

test('everyone asked and one still to answer: it waits and says nothing', async () => {
  const w = world();
  w.state.people = FIVE.slice(0, 2);
  const first = await runOrder(w.deps, order(), NOW);
  const [a] = await contactsOfFind(first.order.findId!);
  await answerContact(a!.id, a!.to, 'no', NOW + HOUR);
  const r = await runOrder(w.deps, first.order, NOW + DAY);
  assert.deepEqual(r.outcome, { kind: 'waiting' });
  assert.equal(r.order.emptyRuns, 0);
});

test('nobody fits: nothing is posted, and the empty days are counted', async () => {
  const w = world();
  w.state.people = [];
  const a = await runOrder(w.deps, order(), NOW);
  const b = await runOrder(w.deps, a.order, NOW + DAY);
  const c = await runOrder(w.deps, b.order, NOW + 2 * DAY);
  assert.deepEqual([a.outcome, b.outcome, c.outcome], [{ kind: 'nobody', days: 1 }, { kind: 'nobody', days: 2 }, { kind: 'nobody', days: 3 }]);
  assert.equal(w.posts.length, 0);
});

test('in person with no location: said once, then it waits quietly', async () => {
  const w = world();
  w.state.location = null;
  const a = await runOrder(w.deps, order({ kind: 'in_person', need: 'rice delivered by hand' }), NOW);
  assert.deepEqual(a.outcome, { kind: 'needs-location', first: true });
  const b = await runOrder(w.deps, a.order, NOW + DAY);
  assert.deepEqual(b.outcome, { kind: 'needs-location', first: false });
  assert.equal(w.posts.length, 0);

  w.state.location = LAGOS;
  const c = await runOrder(w.deps, b.order, NOW + 2 * DAY);
  assert.equal(c.outcome.kind, 'asked');
  assert.equal(c.order.told, undefined);
});

test('too little money to post: said once, no find is left behind, and nobody is asked', async () => {
  const w = world();
  w.state.post = 'short';
  const a = await runOrder(w.deps, order(), NOW);
  assert.deepEqual(a.outcome, { kind: 'short', first: true });
  assert.equal(a.order.findId, null);
  assert.equal(w.notes.length, 0);
  const b = await runOrder(w.deps, a.order, NOW + DAY);
  assert.deepEqual(b.outcome, { kind: 'short', first: false });

  w.state.post = 'failed';
  const c = await runOrder(w.deps, order(), NOW);
  assert.deepEqual(c.outcome, { kind: 'not-posted' });
});

test('alerts that fail leave the order on its request, so the next run does not post again', async () => {
  const w = world();
  w.state.alertFails = true;
  const a = await runOrder(w.deps, order(), NOW);
  assert.deepEqual(a.outcome, { kind: 'waiting' });
  assert.equal(a.order.jobId, '0xjob1');
  w.state.alertFails = false;
  const b = await runOrder(w.deps, a.order, NOW + DAY);
  assert.deepEqual(b.outcome, { kind: 'asked', n: 3, names: ['Ngozi', 'Amaka', 'Tunde'] });
  assert.equal(w.posts.length, 1);
});

test('a locked deal finishes the order; a request that ended starts a fresh find', async () => {
  const w = world();
  const first = await runOrder(w.deps, order(), NOW);
  w.state.request = 'locked';
  const done = await runOrder(w.deps, first.order, NOW + DAY);
  assert.deepEqual(done.outcome, { kind: 'ended', why: 'locked' });
  assert.equal(done.order.state, 'done');
  assert.equal(done.order.week.locked, 1);

  w.state.request = 'ended';
  await closeContactsOfFind(first.order.findId!, NOW + DAY);
  const again = await runOrder(w.deps, first.order, NOW + 2 * DAY);
  assert.equal(again.outcome.kind, 'asked');
  assert.equal(w.posts.length, 2);
  assert.notEqual(again.order.findId, first.order.findId);
  assert.equal(again.order.jobId, '0xjob2');
});

test('a find that ran its week is left and a fresh one starts', async () => {
  const w = world();
  const first = await runOrder(w.deps, order(), NOW);
  const later = await runOrder(w.deps, first.order, NOW + 8 * DAY);
  assert.equal(later.outcome.kind, 'asked');
  assert.equal(w.posts.length, 2);
});

test('a lower budget is used by the next find, not by the request already open', async () => {
  const w = world();
  const first = await runOrder(w.deps, order(), NOW);
  const cheaper = { ...first.order, budgetUsdc: '32' };
  await runOrder(w.deps, cheaper, NOW + DAY);
  assert.equal(w.posts.length, 1);
  assert.equal(w.posts[0]!.budgetUsdc, '40');
  w.state.request = 'ended';
  await runOrder(w.deps, cheaper, NOW + 2 * DAY);
  assert.equal(w.posts[1]!.budgetUsdc, '32');
});

const need = (ref: string, buyer: string, over: Partial<LeadCandidate> = {}): LeadCandidate => ({
  kind: 'need', ref, buyer, what: 'Rice every week', keywords: ['rice'], budgetUsdc: 40, every: 'week', deliveryKind: 'goods', where: { scope: 'near' },
  buyerLocation: LAGOS, buyerVerified: true, buyerTier: 'ESTABLISHED', dueDays: null, open: true, contactFrom: 'anyone', ...over,
});
const ME: LeadSeller = { user: '0xbuyer', words: ['rice', 'grain'], meet: { atMyPlace: true, comeToYouKm: 20, online: true }, location: LAGOS, verified: true, priceMin: 30 };

test('a selling order pitches regular needs at the usual price, never open requests, never the same need twice', async () => {
  const w = world();
  w.state.lead = ME;
  w.state.leads = [need('n1', '0xa'), need('n2', '0xb'), need('n3', '0xc'), need('0xreq', '0xd', { kind: 'request' })];
  const selling = order({ side: 'sell', need: 'Buyers for my rice', budgetUsdc: null, perDay: 2 });
  const a = await runOrder(w.deps, selling, NOW);
  assert.deepEqual(a.outcome, { kind: 'pitched', n: 2 });
  assert.deepEqual(w.notes, ['0xa', '0xb']);
  const sent = await contactsOfFind(a.order.findId!);
  assert.deepEqual(sent.map((c) => [c.kind, c.needId, c.offer?.priceUsdc, c.offer?.days]), [['pitch', 'n1', '35', 2], ['pitch', 'n2', '35', 2]]);

  const b = await runOrder(w.deps, a.order, NOW + DAY);
  assert.deepEqual(b.outcome, { kind: 'pitched', n: 1 });
  assert.deepEqual(w.notes, ['0xa', '0xb', '0xc']);
  const c = await runOrder(w.deps, b.order, NOW + 2 * DAY);
  assert.deepEqual(c.outcome, { kind: 'nobody', days: 1 });
  assert.equal(w.posts.length, 0);
});

test('a seller with no price set, or no selling profile, pitches nobody', async () => {
  const w = world();
  w.state.leads = [need('n1', '0xa')];
  const selling = order({ side: 'sell', need: 'Buyers for my rice', budgetUsdc: null });
  assert.deepEqual((await runOrder(w.deps, selling, NOW)).outcome, { kind: 'nobody', days: 1 });
  w.state.lead = ME;
  w.state.way = null;
  assert.deepEqual((await runOrder(w.deps, selling, NOW)).outcome, { kind: 'nobody', days: 1 });
  assert.equal(w.notes.length, 0);
});

test('a find that is a draft is never saved for a run that could not post', async () => {
  const w = world();
  w.state.post = 'short';
  const saved: Find[] = [];
  const deps: RunDeps = { ...w.deps, saveFind: async (f) => (saved.push(f), saveFind(f)) };
  await runOrder(deps, order(), NOW);
  assert.equal(saved.length, 0);
});


test('a standing order asks for its people with its own id, so its meaning vector is kept', async () => {
  const w = world();
  w.state.agree = true;
  const refs: unknown[] = [];
  const people = w.deps.people;
  w.deps.people = async (q) => { refs.push(q.ref); return people(q); };
  const o = order({});
  await runOrder(w.deps, o, NOW);
  assert.deepEqual(refs[0], { id: o.id, owner: o.owner });
});
