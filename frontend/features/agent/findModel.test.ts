import assert from 'node:assert/strict';
import test from 'node:test';
import { beFoundOf, meetLine, meetOf, reachableOf, stepKm, validMeet } from './findModel';

/// Be found and be reached on Your agent (view 72).

const words = { atPlaceShort: 'at your shop', goToShort: 'you go to people up to {n} km away', onlineShort: 'online' };

test('found only by choice, and setup\'s Find clients for me counts as choosing', () => {
  assert.equal(beFoundOf({}), false);
  assert.equal(beFoundOf({ agentPrefs: { findClients: true } }), true);
  assert.equal(beFoundOf({ agentPrefs: { findClients: true }, settings: { beFound: false } }), false);
  assert.equal(reachableOf({ settings: { reachable: true } }), true);
});

test('how they meet people reads as one line', () => {
  assert.equal(meetLine({ atMyPlace: true, comeToYouKm: 10, online: false }, words), 'at your shop, you go to people up to 10 km away');
  assert.equal(meetLine(meetOf({}), words), 'online');
});

test('at least one way to meet, and a reach of 1 to 100 km', () => {
  assert.equal(validMeet({ atMyPlace: false, comeToYouKm: null, online: false }), false);
  assert.equal(validMeet({ atMyPlace: false, comeToYouKm: 101, online: false }), false);
  assert.equal(validMeet({ atMyPlace: false, comeToYouKm: 10, online: false }), true);
});

test('the km stepper moves through round distances and stops at the ends', () => {
  assert.equal(stepKm(10, true), 15);
  assert.equal(stepKm(10, false), 5);
  assert.equal(stepKm(1, false), 1);
  assert.equal(stepKm(100, true), 100);
  assert.equal(stepKm(7, true), 10);
  assert.equal(stepKm(7, false), 5);
});
