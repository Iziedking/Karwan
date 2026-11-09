import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantAction } from './actions.js';
import { findTools, type FindToolDeps } from './findTools.js';
import type { StandingNeed } from '../find/needs.js';
import type { Find } from '../find/finds.js';
import type { FindCandidate } from '../find/rank.js';

/// Being reached and blocking from the assistant (view 72).

const call = { toolCallId: 't1', messages: [] };
const ID = '6f1c2a3b-0000-4000-8000-000000000001';
const ME = '0xrestaurant';
const TOMATOES: StandingNeed = { id: 'n1', owner: ME, what: 'Fresh tomatoes for my restaurant', every: 'week', budgetUsdc: '33.43', currency: null, kind: 'goods', paused: false, createdAt: 1 };

function setup(over: Partial<FindToolDeps> = {}) {
  const actions: AssistantAction[] = [];
  const deps: FindToolDeps = {
    reachable: async () => true,
    needs: async () => [TOMATOES],
    byTag: async (tag) => (tag === 'ada' ? { address: '0xADA0000000000000000000000000000000000000', handle: 'ada' } : null),
    money: async (_a, usdc) => `₦${Math.round(usdc * 1346).toLocaleString('en')}`,
    people: async () => [],
    buyer: async () => ({ location: null, verified: false }),
    blocked: async () => new Set(),
    saveFind: async (f) => f,
    finds: async () => [],
    cleanRecordCounts: false,
    now: () => 1_000,
    newId: () => ID,
    decline: async () => 'none',
    customers: async () => ({ seller: null, leads: [] }),
    pitches: async () => [],
    pitch: async () => null,
    answerPitch: async () => 'none',
    ...over,
  };
  return { actions, tools: findTools(ME, actions, deps) };
}

const card = (actions: AssistantAction[]) => actions[0] as unknown as { intent: string; title: string; summary: string; fields: { label: string; value: string }[]; payload: Record<string, unknown> };

test('a need is read back in the person\'s own money, with its id', async () => {
  const s = setup();
  const out = (await s.tools.my_standing_needs.execute!({}, call)) as { reachable: boolean; needs: Array<{ id: string; line: string }> };
  assert.equal(out.reachable, true);
  assert.deepEqual(out.needs[0], { id: 'n1', what: 'Fresh tomatoes for my restaurant', line: 'Every week · about ₦44,997 · delivered', paused: false });
});

test('adding a need is a card that says nothing is paid, with the budget as they read it', async () => {
  const s = setup({ needs: async () => [] });
  await s.tools.propose_standing_need.execute!({ what: 'Office cleaning', every: 'month', budgetUsdc: 59.4, kind: 'in_person' }, call);
  const c = card(s.actions);
  assert.equal(c.intent, 'save_standing_need');
  assert.equal(c.title, 'Add a need');
  assert.match(c.summary, /Nothing is paid until you say yes/);
  assert.deepEqual(c.fields.map((f) => f.value), ['Office cleaning', 'Every month', '₦79,952', 'At my place']);
  assert.deepEqual(c.payload, { what: 'Office cleaning', every: 'month', budgetUsdc: 59.4, kind: 'in_person' });
});

test('a need saved while not reachable says nobody is told yet', async () => {
  const s = setup({ needs: async () => [], reachable: async () => false });
  await s.tools.propose_standing_need.execute!({ what: 'School uniforms', every: 'season', kind: 'goods' }, call);
  assert.match(card(s.actions).summary, /nobody is told/);
});

test('changing needs a real id, and an eleventh need is refused', async () => {
  const s = setup();
  const wrong = await s.tools.propose_standing_need.execute!({ id: 'nope', what: 'Tomatoes', every: 'week', kind: 'goods' }, call);
  assert.match((wrong as { error: string }).error, /not on their list/);
  const full = setup({ needs: async () => Array.from({ length: 10 }, (_, i) => ({ ...TOMATOES, id: `n${i}` })) });
  const out = await full.tools.propose_standing_need.execute!({ what: 'Onions', every: 'week', kind: 'goods' }, call);
  assert.match((out as { error: string }).error, /already keep 10/);
  await s.tools.propose_standing_need.execute!({ id: 'n1', what: 'Tomatoes', every: 'week', kind: 'goods', paused: true }, call);
  assert.equal(card(s.actions).title, 'Change this need');
  assert.equal(card(s.actions).fields.at(-1)?.value, 'Paused');
});

test('removing a need names it', async () => {
  const s = setup();
  await s.tools.propose_remove_standing_need.execute!({ id: 'n1' }, call);
  assert.equal(card(s.actions).intent, 'remove_standing_need');
  assert.deepEqual(card(s.actions).fields, [{ label: 'Need', value: 'Fresh tomatoes for my restaurant' }]);
});

test('a block is by tag, never yourself, and the person is not told', async () => {
  const s = setup();
  await s.tools.propose_block_person.execute!({ tag: '@ada', block: true }, call);
  const c = card(s.actions);
  assert.equal(c.intent, 'block_person');
  assert.equal(c.payload.who, '0xada0000000000000000000000000000000000000');
  assert.match(c.summary, /They are not told/);
  const nobody = await s.tools.propose_block_person.execute!({ tag: 'ghost', block: true }, call);
  assert.match((nobody as { error: string }).error, /Nobody on Karwan/);
  const self = setup({ byTag: async () => ({ address: ME, handle: 'me' }) });
  assert.match(((await self.tools.propose_block_person.execute!({ tag: 'me', block: true }, call)) as { error: string }).error, /their own tag/);
});

const TAILOR: FindCandidate = {
  user: '0xtailor', sellerAgent: '0xtailoragent', name: 'Ngozi Stitches', tag: 'ngozi', words: ['tailor', 'dress', 'sewing'],
  meet: { atMyPlace: true, comeToYouKm: null, online: false },
  location: { country: 'NG', city: 'Abuja', area: 'Maitama', reach: {}, point: { lat: 9.09, lng: 7.491, precision: 'area', source: 'osm', at: 1 } },
  verified: true, tier: 'ESTABLISHED', rating: { kind: 'rated', value: 4.8, count: 12, disputed: 0 }, price: { min: 40, usual: 60 }, days: { min: 2, max: 5 },
  onTimeRate: 90, completed: 12, disputesLost: 0, contactFrom: 'anyone', outsideAgents: true,
};
const WUSE = { country: 'NG', city: 'Abuja', area: 'Wuse 2', reach: {}, point: { lat: 9.07, lng: 7.479, precision: 'area' as const, source: 'osm', at: 1 } };
const FIND = { need: 'a tailor to make a dress', budgetUsdc: 70, kind: 'in_person' as const, where: 'near' as const };

test('find_people asks once where they are before an in-person find', async () => {
  const s = setup();
  const out = (await s.tools.find_people.execute!(FIND, call)) as { needsLocation?: boolean };
  assert.equal(out.needsLocation, true);
});

test('find_people lists who fits with distance in words, saves the find, and moves nothing', async () => {
  const saved: Find[] = [];
  const s = setup({
    people: async () => [TAILOR, { ...TAILOR, user: '0xquote', tag: 'quote', name: 'Quote Tailors', verified: false, price: null, days: null }],
    buyer: async () => ({ location: WUSE, verified: false }),
    saveFind: async (f) => { saved.push(f); return f; },
  });
  const out = (await s.tools.find_people.execute!(FIND, call)) as { found: number; link: string; people: Array<Record<string, unknown>> };
  assert.equal(out.found, 2);
  assert.equal(out.link, `/find/${ID}`);
  assert.equal(out.people[0]!.tag, '@ngozi');
  assert.equal(out.people[0]!.distance, 'about 3 km away');
  assert.equal(out.people[0]!.meets, 'at their place');
  assert.equal(out.people[0]!.price, '₦80,760');
  assert.equal(out.people[0]!.recommended, true);
  assert.equal(out.people[1]!.price, 'Asks for a quote');
  assert.equal(JSON.stringify(out).includes('7.491'), false);
  assert.equal(JSON.stringify(out).includes('Maitama'), false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.owner, ME);
  assert.equal(saved[0]!.endsAt, 1_000 + 7 * 86_400_000);
  assert.equal(s.actions.length, 1, 'one link to the people, no confirm card: finding contacts nobody');
  assert.deepEqual(s.actions[0], { kind: 'navigate', id: `/find/${ID}`, label: 'See all 2', href: `/find/${ID}`, description: undefined });
});

test('find_people with nobody who fits says so and saves nothing', async () => {
  const saved: Find[] = [];
  const s = setup({ buyer: async () => ({ location: WUSE, verified: false }), saveFind: async (f) => { saved.push(f); return f; } });
  const out = (await s.tools.find_people.execute!(FIND, call)) as { found: number; next: string };
  assert.equal(out.found, 0);
  assert.match(out.next, /open market/);
  assert.equal(saved.length, 0);
});

test('people they blocked, or who blocked them, never come up', async () => {
  const s = setup({ people: async () => [TAILOR], buyer: async () => ({ location: WUSE, verified: false }), blocked: async () => new Set(['0xtailor']) });
  const out = (await s.tools.find_people.execute!(FIND, call)) as { found: number };
  assert.equal(out.found, 0);
});

const CHEF_LEADS = [
  { kind: 'need' as const, ref: 'n9', buyer: '0xcafe', what: 'Lunch for 20 every Friday', keywords: ['lunch'], budgetUsdc: 40, every: 'week' as const, deliveryKind: 'in_person' as const, where: { scope: 'near' as const }, buyerLocation: null, buyerVerified: true, buyerTier: 'ESTABLISHED' as const, dueDays: null, open: true, contactFrom: 'anyone' as const },
  { kind: 'request' as const, ref: '0xjob1', buyer: '0xoffice', what: 'Lunch for a launch party', keywords: ['lunch'], budgetUsdc: 90, every: null, deliveryKind: 'remote' as const, where: { scope: 'anywhere' as const }, buyerLocation: null, buyerVerified: false, buyerTier: 'NEW' as const, dueDays: 3, open: true, contactFrom: 'anyone' as const },
];
const CHEF = { user: ME, words: ['lunch', 'catering'], meet: { atMyPlace: false, comeToYouKm: 20, online: true }, location: null, verified: true, priceMin: null };

test('find_customers lists open requests and reachable needs, numbered, with no buyer named', async () => {
  const saved: Find[] = [];
  const s = setup({
    customers: async () => ({ seller: { ...CHEF, location: WUSE }, leads: CHEF_LEADS.map((l) => ({ ...l, buyerLocation: WUSE })) }),
    saveFind: async (f) => { saved.push(f); return f; },
  });
  const out = (await s.tools.find_customers.execute!({}, call)) as { found: number; buyers: Array<Record<string, unknown>> };
  assert.equal(out.found, 2);
  assert.deepEqual(out.buyers.map((b) => [b.number, b.kind]), [[1, 'regular need'], [2, 'open request']]);
  assert.equal(out.buyers[0]!.budget, 'about ₦53,840');
  assert.equal(out.buyers[1]!.jobId, '0xjob1');
  assert.doesNotMatch(JSON.stringify(out), /0xcafe|0xoffice/);
  assert.equal(saved[0]!.side, 'seller');
  assert.equal(saved[0]!.leads!.length, 2);
  assert.deepEqual(s.actions.map((a) => a.kind), ['navigate'], 'a link to the buyers, no card: finding buyers contacts nobody');
});

test('pitch_buyers is a card for needs only, in the seller money, saying nothing is paid', async () => {
  const find: Find = {
    id: ID, owner: ME, side: 'seller', mode: 'choose', need: 'Buyers for what I sell', budgetUsdc: '0', kind: 'remote', where: { scope: 'anywhere' }, jobId: null, needId: null, rows: [],
    leads: [
      { kind: 'need', ref: 'n9', buyer: '0xrestaurant', what: 'Lunch for 20 every Friday', budgetUsdc: '40', every: 'week', deliveryKind: 'in_person', dueDays: null, distance: { key: 'about', km: 3 }, buyerVerified: true, buyerTier: 'ESTABLISHED' },
      { kind: 'request', ref: '0xjob1', buyer: '0xoffice', what: 'Lunch for a launch party', budgetUsdc: '90', every: null, deliveryKind: 'remote', dueDays: 3, distance: { key: 'unknown' }, buyerVerified: false, buyerTier: 'NEW' },
    ],
    status: 'shortlisted', createdAt: 1, endsAt: 10_000,
  };
  const s = setup({ finds: async () => [find] });
  const refused = (await s.tools.pitch_buyers.execute!({ buyers: [1, 2], priceUsdc: 33.43, days: 2 }, call)) as { error: string };
  assert.match(refused.error, /open request.*propose_make_offer/);
  await s.tools.pitch_buyers.execute!({ buyers: [1], priceUsdc: 33.43, days: 2, note: 'Jollof and chicken' }, call);
  const c = card(s.actions);
  assert.equal(c.intent, 'pitch_buyers');
  assert.equal(c.title, 'Offer to help 1 buyer');
  assert.match(c.summary, /Nothing is paid/);
  assert.deepEqual(c.fields.map((f) => f.value).slice(1, 3), ['₦44,997', '2 days']);
  assert.deepEqual(c.payload, { findId: ID, picks: [0], priceUsdc: '33.43', days: 2, note: 'Jollof and chicken' });
});

const PITCH = {
  id: 'p1', what: 'Lunch for 20 every Friday', kind: 'in_person' as const, distance: { key: 'about' as const, km: 3 },
  seller: { name: 'Chef Bisi', verified: true, stars: 4.8, tag: 'bisi', photo: null }, priceUsdc: '33.43', days: 2, note: '', sentAt: 1, answer: null, jobId: null, closed: false,
};

test('interested on a pitch is a private request card to that seller, the budget covering their price', async () => {
  const s = setup({ pitch: async (_b, id) => (id === 'p1' ? PITCH : null) });
  await s.tools.answer_pitch.execute!({ id: 'p1', answer: 'interested' }, call);
  const c = card(s.actions);
  assert.equal(c.intent, 'post_request');
  assert.equal(c.title, 'Ask Chef Bisi for it');
  assert.match(c.fields.find((f) => f.label === 'Who can see it')!.value, /Only you and Chef Bisi/);
  assert.deepEqual(c.payload.pitch, { id: 'p1' });
  assert.equal(c.payload.budgetUsdc, 33.43);
  assert.equal(c.payload.deadlineDays, 5);
});

test('not now and not interested answer at once, with no card; an answered pitch is not answered again', async () => {
  const said: string[] = [];
  const s = setup({ pitch: async () => PITCH, answerPitch: async (_b, _id, a) => { said.push(a); return 'answered'; } });
  const out = (await s.tools.answer_pitch.execute!({ id: 'p1', answer: 'no' }, call)) as { said: string };
  assert.match(out.said, /will not offer for this need again/);
  assert.deepEqual(said, ['no']);
  assert.equal(s.actions.length, 0);
  const done = setup({ pitch: async () => ({ ...PITCH, answer: 'no' as const }) });
  assert.match(((await done.tools.answer_pitch.execute!({ id: 'p1', answer: 'interested' }, call)) as { error: string }).error, /already answered/);
});
