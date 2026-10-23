import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import { readBrief } from './agentBrief.js';

/// The setup answers become the account's settings, with the person's own
/// words kept beside them.
///
///   npx tsx --test src/agents/agentBrief.test.ts

const keywords = async () => ['logo', 'branding'];
const failing = async (): Promise<string[]> => { throw new Error('model down'); };
const deps = { keywords };

test("a freelancer's answers become a selling agent", async () => {
  const r = await readBrief({ goals: ['work'], what: 'Logo and brand design', price: '20 to 40 USDC, 3 days', clients: 'find', own: 'offers' }, null, deps, 'en');
  assert.equal(r.patch.role, 'seller');
  assert.deepEqual(r.patch.seller?.skills, ['logo', 'branding']);
  assert.equal(r.patch.seller?.bio, 'Logo and brand design');
  assert.equal(r.patch.seller?.minBudgetUsdc, 20);
  assert.equal(r.patch.seller?.maxBudgetUsdc, 40);
  assert.equal(r.patch.seller?.minDeadlineDays, 3);
  assert.equal(r.patch.seller?.maxDeadlineDays, 3);
  assert.equal(r.patch.agentPrefs?.findClients, true);
  assert.equal(r.patch.agentPrefs?.agentMode, 'offers');
  assert.deepEqual(r.needs, []);
  assert.equal(r.patch.ownWords?.price, '20 to 40 USDC, 3 days');
});

test('an unreadable price is asked once, then saved as not set and the agent asks first', async () => {
  const first = await readBrief({ goals: ['work'], what: 'Logo design', price: 'depends' }, null, deps, 'en');
  assert.deepEqual(first.needs, ['price']);
  const second = await readBrief({ goals: ['work'], what: 'Logo design', price: 'it depends', retried: true }, null, deps, 'en');
  assert.deepEqual(second.needs, []);
  assert.equal(second.patch.seller?.minBudgetUsdc, 1);
  assert.equal(second.patch.seller?.maxBudgetUsdc, 100000);
  assert.equal(second.patch.agentPrefs?.agentMode, 'ask');
  assert.equal(second.patch.agentPrefs?.sellerPriceSet, false);
});

test("a model failure keeps the person's own words as the tag", async () => {
  const r = await readBrief({ goals: ['work'], what: 'Logo and brand design for small shops in Lagos', price: '30' }, null, { keywords: failing }, 'en');
  assert.deepEqual(r.patch.seller?.skills, ['Logo and brand design for small shops in']);
});

test('buying only makes a buying agent and no selling one', async () => {
  const r = await readBrief({ goals: ['buy'], buy: 'Phone repairs, up to 50 USDC' }, null, deps, 'en');
  assert.equal(r.patch.role, 'buyer');
  assert.equal(r.patch.buyer?.maxBudgetUsdc, 50);
  assert.deepEqual(r.patch.buyer?.milestonePcts, [100]);
  assert.equal('seller' in r.patch, false);
});

test('choosing fewer goals takes the selling agent off the market but keeps its settings', async () => {
  const seller = { skills: ['rice'], bio: 'Rice', minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 3 };
  const current = { address: '0xa', role: 'seller', displayName: 'A', seller, createdAt: 0, updatedAt: 0 } as UserProfile;
  const r = await readBrief({ goals: ['buy'], buy: 'Fabric, up to 200 USDC' }, current, deps, 'en');
  assert.equal(r.patch.role, 'buyer');
  assert.equal(r.patch.agentPrefs?.findClients, false);
  assert.deepEqual(r.patch.seller, seller);
});

test('own clients, reach, business and places each land in their own place', async () => {
  const r = await readBrief(
    { goals: ['sell', 'business', 'record'], what: 'Rice', price: '20 to 40', clients: 'own', reach: 'email', business: 'Bello Foods, rice and grains to shops', places: 'x'.repeat(300), where: 'Nigeria, Lagos' },
    null, deps, 'en',
  );
  assert.equal(r.patch.agentPrefs?.findClients, false);
  assert.equal(r.patch.settings?.notifyVia, 'email');
  assert.deepEqual(r.patch.businessDraft, { name: 'Bello Foods', trades: 'rice and grains to shops' });
  assert.equal(r.patch.settings?.tradesAs, 'business');
  assert.equal(r.patch.workPlaces?.length, 200);
  assert.deepEqual(r.place, { country: 'NG', city: 'Lagos' });
});

test('how clients pay becomes the selling way the agent starts with', async () => {
  const goods = await readBrief({ goals: ['sell'], what: 'Ankara fabric', price: '30 to 60 USDC, 2 to 4 days', paid: 'goods', where: 'Kano, Nigeria' }, null, deps, 'en');
  assert.deepEqual(goods.patch.agentWays?.sell, [
    { shape: 'goods', what: 'Ankara fabric', priceMin: 30, priceMax: 60, shipsTo: 'Kano, Nigeria', arriveDaysMin: 2, arriveDaysMax: 4 },
  ]);
  assert.equal(goods.patch.seller?.tradeType, 'goods');
  assert.ok(goods.lines.includes('Paid when the buyer has the goods'));
  const stages = await readBrief({ goals: ['work'], what: 'Websites', price: '200 to 900 USDC, 14 to 30 days', paid: 'milestones' }, null, deps, 'en');
  assert.equal(stages.patch.agentWays?.sell[0]?.shape, 'milestones');
  const unsaid = await readBrief({ goals: ['work'], what: 'Logos', price: '20 to 40 USDC' }, null, deps, 'en');
  assert.equal(unsaid.patch.agentWays, undefined);
});
