import assert from 'node:assert/strict';
import test from 'node:test';
import { isDiscoverable, ladderFor, nextSteps, type Fact, type FactKind } from './ladder.js';

const now = Date.UTC(2026, 9, 12);
const f = (kind: FactKind, extra: Partial<Fact> = {}): Fact => ({
  kind,
  level: 'official_api',
  issuedAt: now - 1000,
  expiresAt: now + 1e10,
  ...extra,
});
const person = f('person_check', { level: 'person' });
const account = f('owned_account');

test('no facts is registered', () => {
  assert.equal(ladderFor([], now), 'registered');
});

test('a person check alone is not enough', () => {
  assert.equal(ladderFor([person], now), 'registered');
});

test('an owned account alone is not enough', () => {
  assert.equal(ladderFor([account], now), 'registered');
});

test('a person check plus an owned account is person verified', () => {
  assert.equal(ladderFor([person, account], now), 'person_verified');
});

test('a person check plus a CAC match is person verified', () => {
  assert.equal(ladderFor([person, f('cac_match', { level: 'official_record' })], now), 'person_verified');
});

test('an independent client confirmation makes work verified', () => {
  const c = f('client_confirmation', { level: 'user_proof', independent: true });
  assert.equal(ladderFor([person, account, c], now), 'work_verified');
});

test('a confirmation from an unverified client does not', () => {
  const c = f('client_confirmation', { level: 'user_proof', independent: false });
  assert.equal(ladderFor([person, account, c], now), 'person_verified');
});

test('an invoice counts only through a confirmation from a different verified person', () => {
  const invoice = f('invoice', { level: 'user_proof', corroborated: true });
  const friend = f('client_confirmation', { level: 'user_proof', independent: false });
  const verifiedClient = f('client_confirmation', { level: 'user_proof', independent: true });
  assert.equal(ladderFor([person, account, f('invoice', { level: 'user_proof' })], now), 'person_verified');
  assert.equal(ladderFor([person, account, invoice], now), 'person_verified');
  assert.equal(ladderFor([person, account, invoice, friend], now), 'person_verified');
  assert.equal(ladderFor([person, account, invoice, verifiedClient], now), 'work_verified');
});

test('public work on GitHub makes work verified', () => {
  assert.equal(ladderFor([person, account, f('github_work')], now), 'work_verified');
});

test('a CAC match plus one client confirmation, even from an unverified client, makes work verified', () => {
  const cac = f('cac_match', { level: 'official_record' });
  const c = f('client_confirmation', { level: 'user_proof', independent: false });
  assert.equal(ladderFor([person, cac, c], now), 'work_verified');
});

test('a settled Karwan deal makes work verified', () => {
  assert.equal(ladderFor([person, account, f('karwan_deal', { level: 'partner' })], now), 'work_verified');
});

test('an ID check on top of work verified is id verified', () => {
  const work = f('github_work');
  assert.equal(ladderFor([person, account, work, f('id_check', { level: 'id_verified' })], now), 'id_verified');
});

test('an ID check without verified work stays below id verified', () => {
  assert.equal(ladderFor([person, account, f('id_check', { level: 'id_verified' })], now), 'person_verified');
});

test('an expired fact no longer counts', () => {
  const expired = f('github_work', { expiresAt: now - 1 });
  assert.equal(ladderFor([person, account, expired], now), 'person_verified');
  assert.equal(ladderFor([{ ...person, expiresAt: now - 1 }, account], now), 'registered');
});

test('self-reported facts never count', () => {
  const all = (['person_check', 'owned_account', 'client_confirmation', 'github_work', 'karwan_deal'] as FactKind[]).map((k) =>
    f(k, { level: 'self_reported', independent: true, corroborated: true }),
  );
  assert.equal(ladderFor(all, now), 'registered');
});

test('only work and id verified people are discoverable', () => {
  assert.equal(isDiscoverable('registered'), false);
  assert.equal(isDiscoverable('person_verified'), false);
  assert.equal(isDiscoverable('work_verified'), true);
  assert.equal(isDiscoverable('id_verified'), true);
});

test('the result does not depend on fact order', () => {
  const facts = [f('github_work'), account, person];
  assert.equal(ladderFor(facts, now), ladderFor([...facts].reverse(), now));
});

test('an ID check also counts as the person check, so World ID is not the only way in', () => {
  const id = f('id_check', { level: 'id_verified' });
  assert.equal(ladderFor([id, account], now), 'person_verified');
  assert.equal(ladderFor([id, account, f('github_work')], now), 'id_verified');
});

test('next steps name exactly what is missing, in order', () => {
  assert.deepEqual(nextSteps([], now), ['person_check', 'owned_account', 'work_evidence']);
  assert.deepEqual(nextSteps([person], now), ['owned_account', 'work_evidence']);
  assert.deepEqual(nextSteps([person, account], now), ['work_evidence']);
  assert.deepEqual(nextSteps([person, account, f('github_work')], now), []);
});
