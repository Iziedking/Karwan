import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProfilePatch } from '../agents/agentBrief.js';
import { createSetupRoutes, type SetupRouteDeps } from './setup.js';

/// Setup answers are read on the server: preview saves nothing, save stores
/// what the server read, never what the browser sent as a result.
///
///   npx tsx --test src/routes/setup.test.ts

function harness(over: Partial<SetupRouteDeps> = {}) {
  const saved: ProfilePatch[] = [];
  const places: unknown[] = [];
  let now = 1_000;
  const deps: SetupRouteDeps = {
    sessionAddress: () => '0xada',
    current: async () => ({ address: '0xada', role: 'buyer', displayName: 'Ada', createdAt: 0, updatedAt: 0 }),
    read: async () => ({ patch: { goals: ['work'], agentPrefs: {}, settings: {} }, lines: ['Your agent offers Logo design'], needs: [], place: { country: 'NG', city: 'Lagos' } }),
    save: async (_a, patch) => { saved.push(patch); return { address: '0xada', role: 'seller', displayName: 'Ada', createdAt: 0, updatedAt: 0 }; },
    saveLocation: async (_a, place) => { places.push(place); },
    locale: async () => 'en',
    now: () => now,
    ...over,
  };
  const app = createSetupRoutes(deps);
  const post = (path: string, body: unknown) => app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return { app, post, saved, places, tick: (ms: number) => { now += ms; } };
}

const answers = { goals: ['work'], what: 'Logo design', price: '20 to 40' };

test('no session, no setup', async () => {
  const h = harness({ sessionAddress: () => null });
  assert.equal((await h.post('/preview', { answers })).status, 401);
  assert.equal((await h.post('/save', { answers })).status, 401);
});

test('preview reads and saves nothing', async () => {
  const h = harness();
  const res = await h.post('/preview', { answers });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { lines: ['Your agent offers Logo design'], needs: [] });
  assert.equal(h.saved.length, 0);
});

test("save stores the server's reading, marks setup done and saves the place", async () => {
  const h = harness();
  const res = await h.post('/save', { answers, lines: ['forged'], patch: { role: 'both' } });
  assert.equal(res.status, 200);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0]!.role, undefined);
  assert.equal(h.saved[0]!.settings?.setupDoneAt, 1_000);
  assert.deepEqual(h.places, [{ country: 'NG', city: 'Lagos' }]);
});

test('an answer the server could not read is not saved yet', async () => {
  const h = harness({ read: async () => ({ patch: { goals: ['work'], agentPrefs: {}, settings: {} }, lines: [], needs: ['price'], place: null }) });
  const res = await h.post('/save', { answers });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'answer needed', needs: ['price'] });
  assert.equal(h.saved.length, 0);
});

test('bad answers are refused', async () => {
  const h = harness();
  assert.equal((await h.post('/preview', { answers: { goals: ['dance'] } })).status, 400);
});

test('one account gets 20 readings in ten minutes', async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) assert.equal((await h.post('/preview', { answers })).status, 200);
  assert.equal((await h.post('/preview', { answers })).status, 429);
  h.tick(10 * 60 * 1000 + 1);
  assert.equal((await h.post('/preview', { answers })).status, 200);
});
