import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DESK_IDLE_MS, DESK_SESSION_TTL_MS, mintDeskSession, nextDeskClaims, readDeskSession, renewDeskSession } from './deskSession.js';

const SECRET = 'test-secret';
const member = { id: 'm1', sessionEpoch: 2, deskEpoch: 3 };
const MIN = 60_000;
const HOUR = 60 * MIN;

test('a new session lasts 30 minutes from now and names its network', () => {
  const now = 1_000_000;
  const { token, expiresAt } = mintDeskSession(member, SECRET, now, 'testnet');
  assert.equal(expiresAt, now + DESK_IDLE_MS);
  const claims = readDeskSession(token, SECRET, now + 1, 'testnet');
  assert.ok(claims);
  assert.equal(claims.st, now);
  assert.equal(claims.net, 'testnet');
  assert.equal(claims.exp, now + 30 * MIN);
  assert.equal(claims.se, 2);
  assert.equal(claims.de, 3);
});

test('renewing moves the end on, never past 12 hours from the start', () => {
  const { token } = mintDeskSession(member, SECRET, 0, 'mainnet');
  const claims = readDeskSession(token, SECRET, 1, 'mainnet');
  assert.ok(claims);
  const late = 11 * HOUR + 50 * MIN;
  const renewed = nextDeskClaims({ ...claims, exp: late + 1 }, late);
  assert.ok(renewed);
  assert.equal(renewed.exp, DESK_SESSION_TTL_MS);
  assert.equal(nextDeskClaims({ ...claims, exp: 12 * HOUR + 1 }, 12 * HOUR), null);
  const fresh = renewDeskSession(claims, SECRET, 10 * MIN);
  assert.ok(fresh);
  assert.equal(fresh.expiresAt, 40 * MIN);
  assert.equal(readDeskSession(fresh.token, SECRET, 35 * MIN, 'mainnet')?.st, 0);
});

test('30 minutes without use ends it', () => {
  const { token, expiresAt } = mintDeskSession(member, SECRET, 0, 'testnet');
  assert.equal(readDeskSession(token, SECRET, expiresAt + 1, 'testnet'), null);
});

test('a session for one network is refused on the other', () => {
  const { token } = mintDeskSession(member, SECRET, 0, 'mainnet');
  assert.equal(readDeskSession(token, SECRET, 1, 'testnet'), null);
});

test('a session minted before view 79 reads as signed out', () => {
  const payload = Buffer.from(JSON.stringify({ id: 'm1', exp: 10 * HOUR, se: 2, de: 3 })).toString('base64url');
  const sig = createHmac('sha256', `desk-session:${SECRET}`).update(payload).digest('base64url');
  assert.equal(readDeskSession(`desk.${payload}.${sig}`, SECRET, 1, 'testnet'), null);
});
