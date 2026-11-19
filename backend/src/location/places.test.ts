import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestTown, roundPoint, searchTowns, townsFrom, type Town } from './places.js';

const towns: Town[] = townsFrom([
  ['Lagos', 'Lagos', 'NG', 6.454, 3.394, 9000000],
  ['Abuja', 'FCT', 'NG', 9.058, 7.489, 590400],
  ['Ibadan', 'Oyo', 'NG', 7.388, 3.896, 3565108],
  ['Lafia', 'Nasarawa', 'NG', 8.494, 8.515, 127236],
  ['Lafiagi', 'Kwara', 'NG', 8.852, 5.418, 17921],
  ['Ikeja', 'Lagos', 'NG', 6.6, 3.35, 313196],
  ['Accra', 'Greater Accra', 'GH', 5.556, -0.197, 1963264],
  ['Lagoa', 'Algarve', 'PT', 37.135, -8.453, 22975],
]);

test('a search finds towns that start with what was typed, biggest first, then towns that contain it', () => {
  assert.deepEqual(searchTowns(towns, 'NG', 'la').map((t) => t.name), ['Lagos', 'Lafia', 'Lafiagi']);
  assert.deepEqual(searchTowns(towns, 'NG', 'ad').map((t) => t.name), ['Ibadan']);
});

test('case and accents do not matter', () => {
  assert.equal(searchTowns(towns, 'NG', 'ABUJA')[0]?.name, 'Abuja');
  assert.equal(searchTowns(towns, 'ng', 'abújà')[0]?.name, 'Abuja');
});

test('a search stays in the chosen country', () => {
  assert.deepEqual(searchTowns(towns, 'PT', 'la').map((t) => t.name), ['Lagoa']);
  assert.ok(searchTowns(towns, 'NG', 'acc').every((t) => t.cc === 'NG'));
});

test('an empty search gives the biggest towns, at most the limit', () => {
  assert.deepEqual(searchTowns(towns, 'NG', '  ', 3).map((t) => t.name), ['Lagos', 'Ibadan', 'Abuja']);
});

test('the nearest town to a position', () => {
  assert.equal(nearestTown(towns, { lat: 6.5244, lng: 3.3792 })?.name, 'Lagos');
  assert.equal(nearestTown(towns, { lat: 6.61, lng: 3.35 })?.name, 'Ikeja');
  assert.equal(nearestTown(towns, { lat: 5.6, lng: -0.19 })?.cc, 'GH');
});

test('nothing within 50 km is no town at all', () => {
  assert.equal(nearestTown(towns, { lat: 4.0, lng: 1.0 }), null);
  assert.equal(nearestTown(towns, { lat: 6.5244, lng: 3.3792 }, 1), null);
});

test('a point is kept to about a kilometre', () => {
  assert.deepEqual(roundPoint({ lat: 6.52449, lng: 3.37921 }), { lat: 6.52, lng: 3.38 });
  assert.deepEqual(roundPoint({ lat: 0.004, lng: -179.996 }), { lat: 0, lng: -180 });
});
