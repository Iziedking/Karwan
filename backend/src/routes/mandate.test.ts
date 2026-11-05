import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProfilePatch } from '../agents/agentBrief.js';
import { newAgentRecord, type AgentRecord } from '../agents/agentRecord.js';
import type { Mandate, MandatePatch } from '../agents/mandate.js';
import type { UserProfile } from '../db/profiles.js';
import { createMandateRoutes, type MandateRouteDeps } from './mandate.js';

///   npx tsx --test src/routes/mandate.test.ts

const NOW = Date.UTC(2026, 10, 5, 9);

function harness(over: Partial<MandateRouteDeps> = {}) {
  let profile: UserProfile = {
    address: '0xada',
    role: 'both',
    displayName: 'Ada',
    createdAt: 0,
    updatedAt: 0,
    agentWays: { sell: [{ shape: 'one_time', priceMin: 40, priceUsual: 60, daysMin: 3, daysMax: 5 }], buy: [{ shape: 'one_time', maxPrice: 200, needDays: 10 }] },
    seller: { skills: ['logo'], bio: '', minBudgetUsdc: 40, maxBudgetUsdc: 60, minDeadlineDays: 3, maxDeadlineDays: 5, usualSet: true },
    buyer: { maxBudgetUsdc: 200, minDeadlineDays: 1, maxDeadlineDays: 10, bidCollectionSeconds: 45, milestonePcts: [100] },
    agentPrefs: { agentMode: 'ask', findClients: true },
    settings: { locale: 'en' },
  };
  let record: AgentRecord = newAgentRecord('0xada');
  const saved: ProfilePatch[] = [];
  const replans: Array<{ before: Mandate; patch: MandatePatch }> = [];
  const deps: MandateRouteDeps = {
    sessionAddress: () => '0xada',
    current: async () => profile,
    save: async (_a, patch) => {
      saved.push(patch);
      profile = { ...profile, ...patch, settings: { ...profile.settings, ...(patch.settings ?? {}) } } as UserProfile;
      return profile;
    },
    record: async () => record,
    updateRecord: async (_a, change) => (record = change(record)),
    watches: async () => [],
    replan: async (_owner, before, patch) => {
      replans.push({ before, patch });
      return { judged: 0, offered: 0, closedQuestions: 0, line: 'Done. Your agent works this way from now on.' };
    },
    now: () => NOW,
    newId: () => 'g-new',
    ...over,
  };
  const app = createMandateRoutes(deps);
  const post = (body: unknown) => app.request('/', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return { app, post, saved, replans, profile: () => profile, record: () => record };
}

let card = 0;
const fresh = () => `card-${String(++card).padStart(4, '0')}`;

test('signedOutRefused', async () => {
  const h = harness({ sessionAddress: () => null });
  assert.equal((await h.app.request('/')).status, 401);
  assert.equal((await h.post({ patch: { part: 'quiet-off' }, cardId: fresh() })).status, 401);
});

test('GET reads the mandate with its lines', async () => {
  const h = harness();
  const body = (await (await h.app.request('/')).json()) as { mandate: Mandate; lines: string[] };
  assert.equal(body.mandate.alone, 'ask');
  assert.equal(body.lines[0], 'Your agent sells work from 40 USDC (usually 60), in 3 to 5 days.');
});

test('refusesWithoutCard', async () => {
  const h = harness();
  assert.equal((await h.post({ patch: { part: 'quiet-off' } })).status, 400);
  const id = fresh();
  assert.equal((await h.post({ patch: { part: 'quiet-off' }, cardId: id })).status, 200);
  const again = await h.post({ patch: { part: 'quiet-off' }, cardId: id });
  assert.equal(again.status, 409);
  assert.equal(h.replans.length, 1);
});

test('eachPartGoesToItsStore', async () => {
  const h = harness();
  assert.equal((await h.post({ patch: { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }, cardId: fresh() })).status, 200);
  assert.equal(h.profile().agentWays!.sell[0]!.shape, 'one_time');
  assert.equal((h.profile().agentWays!.sell[0] as { priceMin: number }).priceMin, 30);
  assert.equal(h.profile().seller!.minBudgetUsdc, 30);

  assert.equal((await h.post({ patch: { part: 'alone', mode: 'offers' }, cardId: fresh() })).status, 200);
  assert.deepEqual(h.profile().agentPrefs, { agentMode: 'offers', findClients: true, sellerPriceSet: true, buyerPriceSet: true });

  assert.equal((await h.post({ patch: { part: 'buy-most', usdc: 90 }, cardId: fresh() })).status, 200);
  assert.equal((h.profile().agentWays!.buy[0] as { maxPrice: number }).maxPrice, 90);
  assert.equal(h.profile().buyer!.maxBudgetUsdc, 90);

  const savesBefore = h.saved.length;
  assert.equal((await h.post({ patch: { part: 'weekly-limit', usdc: 1 }, cardId: fresh() })).status, 200);
  assert.equal(h.record().weeklyBudgetUsdc, 1);
  assert.equal((await h.post({ patch: { part: 'goal-add', kind: 'buy', text: ' a logo designer ', untilDays: 7 }, cardId: fresh() })).status, 200);
  assert.deepEqual(h.record().goals, [{ id: 'g-new', kind: 'buy', text: 'a logo designer', until: NOW + 7 * 86_400_000, createdAt: NOW }]);
  assert.equal((await h.post({ patch: { part: 'brief', hour: 7, timeZone: 'Africa/Nairobi' }, cardId: fresh() })).status, 200);
  assert.deepEqual(h.record().brief, { on: true, hour: 7, timeZone: 'Africa/Nairobi' });
  assert.equal((await h.post({ patch: { part: 'quiet', from: 22, to: 6 }, cardId: fresh() })).status, 200);
  assert.deepEqual(h.record().quiet, { from: 22, to: 6 });
  assert.equal((await h.post({ patch: { part: 'quiet-off' }, cardId: fresh() })).status, 200);
  assert.equal(h.record().quiet, null);
  assert.equal((await h.post({ patch: { part: 'goal-remove', id: 'g-new' }, cardId: fresh() })).status, 200);
  assert.deepEqual(h.record().goals, []);
  assert.equal(h.saved.length, savesBefore, 'record parts never write the profile');
});

test('a buying limit with no saved ways goes on the buyer settings', async () => {
  const h = harness();
  const { agentWays: _w, ...rest } = h.profile();
  const bare = harness({ current: async () => rest as UserProfile });
  assert.equal((await bare.post({ patch: { part: 'buy-most', usdc: 75 }, cardId: fresh() })).status, 200);
  assert.equal(bare.saved[0]!.buyer!.maxBudgetUsdc, 75);
  assert.equal(bare.saved[0]!.agentWays, undefined);
});

test('badPatchSaysWhy', async () => {
  const h = harness();
  const res = await h.post({ patch: { part: 'sell-price', shape: 'one_time', lowestUsdc: 90 }, cardId: fresh() });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Your lowest price can't be above your usual price." });
  assert.equal((await h.post({ patch: { part: 'weekly-limit', usdc: 9 }, cardId: fresh() })).status, 400);
  assert.equal((await h.post({ patch: { part: 'dance' }, cardId: fresh() })).status, 400);
  assert.equal(h.saved.length, 0);
  assert.equal(h.replans.length, 0);
});

test('returnsTheReplan', async () => {
  const h = harness({
    replan: async () => ({ judged: 2, offered: 1, closedQuestions: 1, line: 'Done. Your agent looked again at 2 of the requests you passed on, now at 30 USDC, and 1 became an offer.' }),
  });
  const res = await h.post({ patch: { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }, cardId: fresh() });
  const body = (await res.json()) as { mandate: Mandate; lines: string[]; replan: { offered: number; line: string } };
  assert.equal(body.replan.offered, 1);
  assert.equal(body.mandate.sell[0]!.lowestUsdc, 30);
  assert.ok(body.lines.length > 3);
});

test('the re-plan sees the mandate from before the change', async () => {
  const h = harness();
  await h.post({ patch: { part: 'alone', mode: 'offers' }, cardId: fresh() });
  assert.equal(h.replans[0]!.before.alone, 'ask');
});
