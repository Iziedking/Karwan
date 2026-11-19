import assert from 'node:assert/strict';
import test from 'node:test';
import { findMe, LOCATE_OPTIONS } from './findMe';

/// "Use my location" (view 39, 19 Nov): the phone gives a position only when
/// the person taps and allows it, and Karwan's server names the nearest town.
///
///   npx tsx --test shared/places/findMe.test.ts

const position = (lat: number, lng: number) => ({ coords: { latitude: lat, longitude: lng } });

test('a position becomes the nearest town, with the point kept for matching', async () => {
  const sent: unknown[] = [];
  const found = await findMe({
    locate: async () => position(6.5244, 3.3792),
    near: async (p) => { sent.push(p); return { country: 'NG', city: 'Lagos', admin: 'Lagos' }; },
  });
  assert.deepEqual(sent, [{ lat: 6.5244, lng: 3.3792 }]);
  assert.deepEqual(found, { country: 'NG', city: 'Lagos', admin: 'Lagos', point: { lat: 6.5244, lng: 3.3792 } });
});

test('refused, unsupported or slow is no answer', async () => {
  assert.equal(await findMe({ locate: async () => { throw new Error('denied'); }, near: async () => ({ country: null }) }), null);
  assert.equal(await findMe({ locate: null, near: async () => ({ country: null }) }), null);
});

test('no town near is no answer', async () => {
  assert.equal(await findMe({ locate: async () => position(4, 1), near: async () => ({ country: null }) }), null);
});

test('the server failing is no answer', async () => {
  assert.equal(await findMe({ locate: async () => position(6.5, 3.4), near: async () => { throw new Error('503'); } }), null);
});

test('the phone is asked for a rough, recent position and gives up after 8 seconds', () => {
  assert.deepEqual(LOCATE_OPTIONS, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
});
