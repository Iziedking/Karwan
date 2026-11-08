import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateLocation } from '../location/rules.js';
import { locationTools, type LocationToolDeps } from './locationTools.js';

/// Telling your agent where you are and where you deliver.
///
///   npx tsx --test src/assistant/locationTools.test.ts

const call = { toolCallId: 't1', messages: [] };
const NOW = 1_760_000_000_000;

function setup(start: PrivateLocation | null = null) {
  let stored = start;
  // Like updateProfile: each change is applied to the latest value, one at a time.
  let chain: Promise<void> = Promise.resolve();
  const deps: LocationToolDeps = {
    now: () => NOW,
    update: (_a, change) => {
      const next = chain.then(async () => {
        await new Promise((r) => setTimeout(r, 1));
        stored = change(stored);
      });
      chain = next;
      return next;
    },
  };
  return { tools: locationTools('0xada', deps), stored: () => stored };
}

test('set_location keeps city and area private and says what is public', async () => {
  const s = setup();
  const out = (await s.tools.set_location.execute!({ country: 'ng', city: 'Lagos', area: 'Yaba' }, call)) as {
    saved: boolean;
    public: { country: string | null };
    checkable: string;
  };
  assert.equal(out.saved, true);
  assert.deepEqual(out.public, { country: 'NG' });
  assert.match(out.checkable, /CAC registration/);
  assert.equal(JSON.stringify(out).includes('Yaba'), false);
  assert.deepEqual(s.stored(), { country: 'NG', city: 'Lagos', area: 'Yaba', reach: {} });
});

test('outside Nigeria the country stays self-stated', async () => {
  const out = (await setup().tools.set_location.execute!({ country: 'GH' }, call)) as { checkable: string };
  assert.match(out.checkable, /self-stated/);
});

test('changing where you are keeps the delivery answers', async () => {
  const s = setup({ country: 'NG', city: 'Lagos', area: null, reach: { GH: { ships: true, days: 5, answeredAt: 1 } } });
  await s.tools.set_location.execute!({ country: 'NG', city: 'Abuja' }, call);
  assert.equal(s.stored()?.reach.GH?.ships, true);
  assert.equal(s.stored()?.city, 'Abuja');
});

test('an invalid country is refused with a plain message', async () => {
  const s = setup();
  const out = (await s.tools.set_location.execute!({ country: 'Nigeria' }, call)) as { saved: boolean; error?: string };
  assert.equal(out.saved, false);
  assert.match(out.error ?? '', /two-letter/);
  assert.equal(s.stored(), null);
});

test('answer_delivery records ships and days and the time', async () => {
  const s = setup({ country: 'NG', city: null, area: null, reach: {} });
  await s.tools.answer_delivery.execute!({ country: 'gh', ships: true, days: 5 }, call);
  await s.tools.answer_delivery.execute!({ country: 'TG', ships: false }, call);
  assert.deepEqual(s.stored()?.reach, {
    GH: { ships: true, days: 5, answeredAt: NOW },
    TG: { ships: false, days: null, answeredAt: NOW },
  });
});

test('answer_delivery works before a home country is set', async () => {
  const s = setup();
  await s.tools.answer_delivery.execute!({ country: 'GH', ships: true }, call);
  assert.equal(s.stored()?.country, null);
  assert.equal(s.stored()?.reach.GH?.ships, true);
});

test('two answers given at once are both kept', async () => {
  const s = setup({ country: 'NG', city: null, area: null, reach: {} });
  await Promise.all([
    s.tools.answer_delivery.execute!({ country: 'GH', ships: true }, call),
    s.tools.answer_delivery.execute!({ country: 'TG', ships: false }, call),
  ]);
  assert.deepEqual(Object.keys(s.stored()!.reach).sort(), ['GH', 'TG']);
});

test('a saved place is then looked up on the map, never waiting for it, and only while they stay there (view 72)', async () => {
  let stored: PrivateLocation | null = { country: 'NG', city: 'Abuja', area: 'Wuse 2', reach: {}, point: { lat: 9.07, lng: 7.479, precision: 'area', source: 'osm', at: 1 } };
  const asked: Array<Pick<PrivateLocation, 'country' | 'city' | 'area'>> = [];
  const deps: LocationToolDeps = {
    now: () => NOW,
    update: async (_a, change) => {
      stored = change(stored);
    },
    locate: async (_a, place) => {
      asked.push(place);
    },
  };
  await locationTools('0xada', deps).set_location.execute!({ country: 'NG', city: 'Abuja', area: 'Maitama' }, call);
  assert.deepEqual(asked, [{ country: 'NG', city: 'Abuja', area: 'Maitama' }]);
  assert.equal(stored?.point, undefined, 'the old point went with the old place');
});
