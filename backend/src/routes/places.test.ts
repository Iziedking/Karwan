import assert from 'node:assert/strict';
import test from 'node:test';
import { townsFrom } from '../location/places.js';
import { createPlacesRoutes, type PlacesRouteDeps } from './places.js';

/// Towns to pick from and the town nearest a phone's position, from Karwan's
/// own list (view 39, 19 Nov). A position is never logged or sent on.

const towns = townsFrom([
  ['Lagos', 'Lagos', 'NG', 6.454, 3.394, 9000000],
  ['Lafia', 'Nasarawa', 'NG', 8.494, 8.515, 127236],
  ['Lafiagi', 'Kwara', 'NG', 8.852, 5.418, 17921],
  ['Accra', 'Greater Accra', 'GH', 5.556, -0.197, 1963264],
]);

function harness(over: Partial<PlacesRouteDeps> = {}) {
  let now = 1_000;
  const logged: string[] = [];
  const deps: PlacesRouteDeps = {
    sessionAddress: () => '0xada',
    towns: () => towns,
    now: () => now,
    log: (line) => { logged.push(line); },
    ...over,
  };
  const app = createPlacesRoutes(deps);
  const near = (body: unknown) => app.request('/near', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return { app, near, logged, tick: (ms: number) => { now += ms; } };
}

test('towns for a country, as typed', async () => {
  const h = harness();
  const res = await h.app.request('/cities?country=NG&q=La');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { towns: [{ name: 'Lagos', admin: 'Lagos' }, { name: 'Lafia', admin: 'Nasarawa' }, { name: 'Lafiagi', admin: 'Kwara' }] });
});

test('no session, no towns', async () => {
  const h = harness({ sessionAddress: () => null });
  assert.equal((await h.app.request('/cities?country=NG&q=La')).status, 401);
  assert.equal((await h.near({ lat: 6.52, lng: 3.38 })).status, 401);
});

test('a country that is not two letters is refused', async () => {
  const h = harness();
  assert.equal((await h.app.request('/cities?country=Nigeria&q=La')).status, 400);
  assert.equal((await h.app.request('/cities?q=La')).status, 400);
});

test('the town nearest a position, with its country', async () => {
  const h = harness();
  const res = await h.near({ lat: 6.5244, lng: 3.3792 });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { country: 'NG', city: 'Lagos', admin: 'Lagos' });
});

test('far from every town, no town is given', async () => {
  const h = harness();
  assert.deepEqual(await (await h.near({ lat: 4, lng: 1 })).json(), { country: null });
});

test('a position that is not on the map is refused', async () => {
  const h = harness();
  assert.equal((await h.near({ lat: 91, lng: 3 })).status, 400);
  assert.equal((await h.near({ lat: 6, lng: 'x' })).status, 400);
});

test('ten positions a minute, then wait', async () => {
  const h = harness();
  for (let i = 0; i < 10; i++) assert.equal((await h.near({ lat: 6.5, lng: 3.4 })).status, 200);
  assert.equal((await h.near({ lat: 6.5, lng: 3.4 })).status, 429);
  h.tick(61_000);
  assert.equal((await h.near({ lat: 6.5, lng: 3.4 })).status, 200);
});

test('thirty searches a minute, then wait', async () => {
  const h = harness();
  for (let i = 0; i < 30; i++) assert.equal((await h.app.request('/cities?country=NG&q=L')).status, 200);
  assert.equal((await h.app.request('/cities?country=NG&q=L')).status, 429);
});

test('a position is never written to the log', async () => {
  const h = harness({ towns: () => { throw new Error('list missing'); } });
  assert.equal((await h.near({ lat: 6.5244, lng: 3.3792 })).status, 503);
  assert.ok(h.logged.length > 0);
  assert.ok(h.logged.every((l) => !l.includes('6.52') && !l.includes('3.37')));
});
