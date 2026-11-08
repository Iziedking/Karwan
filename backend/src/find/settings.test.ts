import assert from 'node:assert/strict';
import test from 'node:test';
import { beFoundOf, contactFromOf, meetOf, reachableOf, validMeet } from './settings.js';

test('nobody is found without choosing it (view 72, rule 1)', () => {
  assert.equal(beFoundOf({}), false);
  assert.equal(beFoundOf({ agentPrefs: {} }), false);
  assert.equal(beFoundOf({ agentPrefs: { findClients: false } }), false);
});

test('"Find clients for me" in setup counts as choosing to be found, until they say otherwise', () => {
  assert.equal(beFoundOf({ agentPrefs: { findClients: true } }), true);
  assert.equal(beFoundOf({ agentPrefs: { findClients: true }, settings: { beFound: false } }), false);
  assert.equal(beFoundOf({ settings: { beFound: true } }), true);
});

test('buyers are reached only when they turn it on', () => {
  assert.equal(reachableOf({}), false);
  assert.equal(reachableOf({ settings: { reachable: true } }), true);
});

test('anyone may contact unless they limit it to verified people', () => {
  assert.equal(contactFromOf({}), 'anyone');
  assert.equal(contactFromOf({ settings: { contactFrom: 'verified' } }), 'verified');
});

test('how they meet people defaults to online only, and a reach is 1 to 100 km', () => {
  assert.deepEqual(meetOf({}), { atMyPlace: false, comeToYouKm: null, online: true });
  assert.equal(validMeet({ atMyPlace: true, comeToYouKm: 10, online: false }), true);
  assert.equal(validMeet({ atMyPlace: false, comeToYouKm: 0, online: false }), false);
  assert.equal(validMeet({ atMyPlace: false, comeToYouKm: 101, online: true }), false);
  assert.equal(validMeet({ atMyPlace: false, comeToYouKm: null, online: false }), false, 'at least one way to meet');
});
