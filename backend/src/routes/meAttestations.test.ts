import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeAttestationRoutes, profileSettingsSaver } from './meAttestations.js';

///   npx tsx --test src/routes/meAttestations.test.ts

const row = (id: string, revoked = false) => ({ id, subject: '0xada', revokedAt: revoked ? 1 : undefined }) as never;

let revokedIds: string[] = [];
let listedFor: string[] = [];
let saved: Array<{ address: string; patch: Record<string, unknown> }> = [];
let order: string[] = [];

function setup(over: { session?: () => string | null } = {}) {
  revokedIds = [];
  listedFor = [];
  saved = [];
  order = [];
  return createMeAttestationRoutes({
    session: over.session ?? (() => '0xADA'),
    list: async (subject) => {
      listedFor.push(subject);
      order.push('list');
      return [row('a1', true), row('a2')];
    },
    revoke: async (id) => {
      revokedIds.push(id);
      return row(id, true);
    },
    saveSettings: async (address, patch) => {
      saved.push({ address, patch });
      order.push('save');
    },
  });
}

test('signed out is refused', async () => {
  const res = await setup({ session: () => null }).request('/revoke', { method: 'POST' });
  assert.equal(res.status, 401);
});

test('removing revokes every statement about you and turns publishing off', async () => {
  const res = await setup().request('/revoke', { method: 'POST' });
  assert.deepEqual(await res.json(), { revoked: 1 });
  assert.deepEqual(revokedIds, ['a2']);
  assert.deepEqual(saved, [{ address: '0xada', patch: { publishDeals: false } }]);
});

test('the remove route takes the address from the session only', async () => {
  const res = await setup().request('/revoke', {
    method: 'POST',
    body: JSON.stringify({ address: '0xother' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.status, 200);
  assert.ok(listedFor.length > 0 && listedFor.every((a) => a === '0xada'));
});

test('publishing is turned off before anything is listed, so the sweep cannot add a statement mid-removal', async () => {
  await setup().request('/revoke', { method: 'POST' });
  assert.equal(order[0], 'save');
  assert.ok(order.includes('list'));
});

test('saving the opt-out creates a profile when the person has none, never silently skips', async () => {
  const writes: unknown[] = [];
  const save = profileSettingsSaver(async () => null, async (p) => {
    writes.push(p);
    return p as never;
  });
  await save('0xada', { publishDeals: false });
  assert.deepEqual(writes, [{ address: '0xada', role: 'buyer', displayName: '', settings: { publishDeals: false } }]);
});

test('saving the opt-out keeps the rest of an existing profile and its settings', async () => {
  const writes: Array<Record<string, unknown>> = [];
  const save = profileSettingsSaver(
    async () => ({ address: '0xada', role: 'seller', displayName: 'Ada', settings: { theme: 'dark' } }) as never,
    async (p) => {
      writes.push(p as Record<string, unknown>);
      return p as never;
    },
  );
  await save('0xada', { publishDeals: false });
  assert.deepEqual(writes[0]!.settings, { theme: 'dark', publishDeals: false });
  assert.equal(writes[0]!.displayName, 'Ada');
});
