import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProfilePatch } from '../agents/agentBrief.js';
import { newAgentRecord, type AgentRecord } from '../agents/agentRecord.js';
import type { Mandate, MandatePatch } from '../agents/mandate.js';
import type { UserProfile } from '../db/profiles.js';
import { actionDigest, type PresenceAction } from '../presence/action.js';
import { agentRuleAction, createMandateRoutes, type MandateRouteDeps } from './mandate.js';

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

test('the agent switch is saved on the profile, and refused where it is not open', async () => {
  const h = harness();
  const off = await h.post({ patch: { part: 'power', on: false }, cardId: fresh() });
  assert.equal(off.status, 200);
  const body = (await off.json()) as { mandate: Mandate; lines: string[] };
  assert.equal(body.mandate.on, false);
  assert.match(body.lines[0]!, /Your agent is off/);
  assert.equal(h.profile().agentPrefs?.agentOn, false);
  // What they chose before is kept for when it comes back on.
  assert.equal(h.profile().agentPrefs?.agentMode, 'ask');
  assert.equal(h.replans.at(-1)?.before.on, true);
  const on = await h.post({ patch: { part: 'power', on: true }, cardId: fresh() });
  assert.equal(((await on.json()) as { mandate: Mandate }).mandate.on, true);
  assert.equal(h.profile().agentPrefs?.agentOn, true);

  const closed = harness({ powerOpen: () => false });
  const res = await closed.post({ patch: { part: 'power', on: false }, cardId: fresh() });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, 'POWER_CLOSED');
  assert.equal(closed.saved.length, 0);
  // Every other part still works there.
  assert.equal((await closed.post({ patch: { part: 'quiet-off' }, cardId: fresh() })).status, 200);
});

/// View 87, step 2: switches, lock limits, presence for a widening, turning back on.

const NEEDS = { code: 'CONFIRM_REQUIRED' };
function lockHarness(over: Partial<MandateRouteDeps> = {}) {
  const asked: PresenceAction[] = [];
  let present = false;
  const h = harness({
    lockOpen: () => true,
    requirePresence: async (c, action) => {
      asked.push(action);
      return present ? null : c.json(NEEDS, 428);
    },
    ...over,
  });
  return { ...h, asked, arrive: () => { present = true; } };
}
const LIMITS = { part: 'lock-rules', on: true, perDealUsdc: 31.25, perWeekUsdc: 93.75, said: { currency: 'NGN', amounts: { perDealUsdc: 50000, perWeekUsdc: 150000 } } };

test('a switch is saved on the profile and keeps the older mode in step', async () => {
  const h = lockHarness();
  assert.equal((await h.post({ patch: { part: 'switch', name: 'offers', on: true }, cardId: fresh() })).status, 200);
  assert.equal(h.profile().agentPrefs?.alone?.offers, true);
  assert.equal(h.profile().agentPrefs?.agentMode, 'offers');
  assert.equal(h.profile().agentPrefs?.alone?.bargain, false, 'a switch nobody touched stays as it read');
  assert.equal((await h.post({ patch: { part: 'switch', name: 'offers', on: false }, cardId: fresh() })).status, 200);
  assert.equal(h.profile().agentPrefs?.agentMode, 'ask');
  assert.equal(h.asked.length, 0);
});

test('the brief switch is saved on the agent record', async () => {
  const h = lockHarness();
  const saves = h.saved.length;
  assert.equal((await h.post({ patch: { part: 'switch', name: 'brief', on: false }, cardId: fresh() })).status, 200);
  assert.equal(h.record().brief?.on, false);
  assert.equal(h.saved.length, saves);
});

test('Lock money turned on without the passkey stays off, and the same card confirms it', async () => {
  const h = lockHarness();
  await h.post({ patch: { part: 'switch', name: 'agree', on: true }, cardId: fresh() });
  const id = fresh();
  const first = await h.post({ patch: LIMITS, cardId: id });
  assert.equal(first.status, 428);
  assert.deepEqual(await first.json(), NEEDS);
  assert.equal(h.record().lock, undefined);
  assert.notEqual(h.profile().agentPrefs?.alone?.lock, true);
  assert.equal(h.asked[0]!.kind, 'agent_rule');
  assert.deepEqual(h.asked[0]!.detail, { lock: 'on', perDeal: '31250000', perWeek: '93750000', perDay: '3', who: 'record' });

  h.arrive();
  const second = await h.post({ patch: LIMITS, cardId: id });
  assert.equal(second.status, 200);
  assert.deepEqual(h.record().lock, {
    perDeal: { usdc: 31.25, said: { currency: 'NGN', amount: '50000' } },
    perWeek: { usdc: 93.75, said: { currency: 'NGN', amount: '150000' } },
    perDay: 3,
    who: 'record',
    locks: [],
  });
  assert.equal(h.profile().agentPrefs?.alone?.lock, true);
  const body = (await second.json()) as { mandate: Mandate };
  assert.equal(body.mandate.switches.lock, true);
});

test('lowering a limit or turning Lock money off never asks for the passkey', async () => {
  const h = lockHarness();
  h.arrive();
  await h.post({ patch: { part: 'switch', name: 'agree', on: true }, cardId: fresh() });
  await h.post({ patch: LIMITS, cardId: fresh() });
  const asked = h.asked.length;
  assert.equal((await h.post({ patch: { part: 'lock-rules', perDealUsdc: 10 }, cardId: fresh() })).status, 200);
  assert.deepEqual(h.record().lock!.perDeal, { usdc: 10 });
  assert.equal((await h.post({ patch: { part: 'lock-rules', perDay: 1, who: 'verified' }, cardId: fresh() })).status, 200);
  assert.equal((await h.post({ patch: { part: 'switch', name: 'lock', on: false }, cardId: fresh() })).status, 200);
  assert.equal(h.asked.length, asked);
  assert.equal(h.profile().agentPrefs?.alone?.lock, false);
  // Raising one again asks.
  assert.equal((await h.post({ patch: { part: 'lock-rules', perDay: 2 }, cardId: fresh() })).status, 200);
  assert.equal(h.asked.length, asked + 1);
});

test('a network with Lock money closed refuses it before anything else', async () => {
  for (const lockOpen of [() => false, undefined]) {
    const h = lockHarness({ lockOpen });
    await h.post({ patch: { part: 'switch', name: 'agree', on: true }, cardId: fresh() });
    for (const patch of [LIMITS, { part: 'switch', name: 'lock', on: true }, { part: 'lock-rules', perDay: 2 }]) {
      const res = await h.post({ patch, cardId: fresh() });
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { code: string }).code, 'LOCK_CLOSED');
    }
    assert.equal(h.asked.length, 0);
    assert.equal(h.record().lock, undefined);
    assert.equal((await h.post({ patch: { part: 'switch', name: 'lock', on: false }, cardId: fresh() })).status, 200, 'turning it off is always allowed');
    const read = (await (await h.app.request('/')).json()) as { lockOpen: boolean };
    assert.equal(read.lockOpen, false);
  }
});

test('with no way to confirm, a widening is refused and nothing is saved', async () => {
  const h = harness({ lockOpen: () => true });
  await h.post({ patch: { part: 'switch', name: 'agree', on: true }, cardId: fresh() });
  const res = await h.post({ patch: LIMITS, cardId: fresh() });
  assert.equal(res.status, 400);
  assert.equal(h.record().lock, undefined);
});

test('turning back on clears the stop and leaves Lock money off', async () => {
  const h = lockHarness();
  h.arrive();
  await h.post({ patch: { part: 'switch', name: 'agree', on: true }, cardId: fresh() });
  await h.post({ patch: LIMITS, cardId: fresh() });
  assert.equal((await h.post({ patch: { part: 'resume' }, cardId: fresh() })).status, 400, 'nothing to turn back on');
  const asked = h.asked.length;
  let after: AgentRecord | null = null;
  const s = lockHarness({
    record: async () => ({ ...h.record(), stopped: { at: NOW, reason: 'locks-today' as const }, lockFailures: 2 }),
    current: async () => h.profile(),
    updateRecord: async (_a, change) => (after = change({ ...h.record(), stopped: { at: NOW, reason: 'locks-today' as const }, lockFailures: 2 })),
  });
  const res = await s.post({ patch: { part: 'resume' }, cardId: fresh() });
  assert.equal(res.status, 200);
  assert.equal(after!.stopped, undefined);
  assert.equal(after!.lockFailures, undefined);
  assert.ok(after!.lock, 'the limits are kept for when Lock money is turned on again');
  assert.equal(s.saved.at(-1)!.agentPrefs!.alone!.lock, false);
  assert.equal(s.asked.length, 0);
  assert.equal(h.asked.length, asked);
});

test('what is confirmed is the limits after the change, so one proof fits one set of figures', () => {
  const before = { lock: { perDeal: { usdc: 30 }, perWeek: { usdc: 90 }, perDay: 3, who: 'record' as const } } as Mandate;
  const a = agentRuleAction('0xADA', before, { part: 'lock-rules', perDealUsdc: 50 });
  const b = agentRuleAction('0xADA', before, { part: 'lock-rules', perDealUsdc: 500 });
  assert.equal(a.wallet, '0xada');
  assert.equal(a.detail.perDeal, '50000000');
  assert.equal(a.detail.perWeek, '90000000');
  assert.notEqual(actionDigest(a, 5042002), actionDigest(b, 5042002));
  assert.equal(actionDigest(a, 5042002), actionDigest(agentRuleAction('0xada', before, { part: 'lock-rules', perDealUsdc: 50 }), 5042002));
  const on = agentRuleAction('0xada', before, { part: 'switch', name: 'lock', on: true });
  assert.deepEqual(on.detail, { lock: 'on', perDeal: '30000000', perWeek: '90000000', perDay: '3', who: 'record' });
});
