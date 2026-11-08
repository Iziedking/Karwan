import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceKm, distanceLine, publicLocation, withoutPoint, withPlace, type PrivateLocation } from './rules.js';

const WUSE = { lat: 9.07, lng: 7.479 };
const MAITAMA = { lat: 9.09, lng: 7.491 };
const LAGOS = { lat: 6.507, lng: 3.375 };

const at = (point?: PrivateLocation['point']): PrivateLocation => ({ country: 'NG', city: 'Abuja', area: 'Wuse 2', reach: {}, ...(point ? { point } : {}) });

test('a point is never part of what anyone else sees (view 72)', () => {
  const loc = at({ ...WUSE, precision: 'area', source: 'osm', at: 1 });
  assert.deepEqual(publicLocation(loc), { country: 'NG' });
  assert.equal(JSON.stringify(publicLocation(loc)).includes('7.479'), false);
});

test('distance between two points, in km', () => {
  assert.ok(Math.abs(distanceKm(WUSE, MAITAMA) - 2.6) < 0.5);
  const lagosAbuja = distanceKm(LAGOS, WUSE);
  assert.ok(lagosAbuja > 500 && lagosAbuja < 560, String(lagosAbuja));
});

test('others only ever read a rounded line, never a point', () => {
  assert.deepEqual(distanceLine(0.4, 4, 'Abuja'), { key: 'nearby' });
  assert.deepEqual(distanceLine(2.6, 3, 'Abuja'), { key: 'about', km: 3 });
  assert.deepEqual(distanceLine(19.6, 3, 'Abuja'), { key: 'about', km: 20 });
  assert.deepEqual(distanceLine(45, 3, 'Abuja'), { key: 'inCity', city: 'Abuja' });
  assert.deepEqual(distanceLine(45, 2, null), { key: 'far', km: 45 });
  assert.deepEqual(distanceLine(null, 3, 'Abuja'), { key: 'sameCity', city: 'Abuja' });
  assert.deepEqual(distanceLine(null, 2, null), { key: 'sameCountry' });
  assert.deepEqual(distanceLine(null, 1, null), { key: 'unknown' });
});

test('moving drops the old point, so a stale one is never used', () => {
  const before = at({ ...WUSE, precision: 'area', source: 'osm', at: 1 });
  assert.equal(withPlace(before, { country: 'NG', city: 'Abuja', area: 'Maitama' }).point, undefined);
  assert.equal(withPlace(before, { country: 'NG', city: 'Lagos', area: null }).point, undefined);
  assert.deepEqual(withPlace(before, { country: 'NG', city: 'abuja', area: 'wuse 2' }).point, before.point, 'same place in other case keeps it');
  assert.deepEqual(withPlace(null, { country: 'NG', city: 'Abuja', area: null }).reach, {});
});

test('the owner\'s own profile carries the place but never the point', () => {
  const loc = at({ lat: 9.07, lng: 7.479, precision: 'area', source: 'osm', at: 1 });
  assert.deepEqual(withoutPoint(loc), { country: 'NG', city: 'Abuja', area: 'Wuse 2', reach: {} });
});
