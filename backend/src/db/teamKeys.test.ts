import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/// The definition of done for team access keys: issue a key, use it, revoke it,
/// and prove access dies.
///
/// This runs against the flat-file store, not Postgres. That is deliberate on
/// two counts. It keeps the test hermetic, and it means a stray `--env-file`
/// cannot point it at production and start writing keys there. The guard below
/// makes that refusal explicit rather than trusting the environment.
///
///   npx tsx --test src/db/teamKeys.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

const { issueTeamKey, verifyTeamKey, revokeTeamKey, listTeamKeys } = await import('./teamKeys.js');

const STORE_PATH = resolve(process.cwd(), 'data', 'team-access-keys.json');
let saved: string | null = null;

before(() => {
  saved = existsSync(STORE_PATH) ? readFileSync(STORE_PATH, 'utf8') : null;
  if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
});

after(() => {
  if (saved !== null) writeFileSync(STORE_PATH, saved, 'utf8');
  else if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
});

test('a key works, then stops working the moment it is revoked', async () => {
  const { key, rawKey } = await issueTeamKey({
    label: 'test laptop',
    member: 'tester',
    role: 'marketing',
  });

  const before = await verifyTeamKey(rawKey);
  assert.equal(before.valid, true);
  assert.equal(before.role, 'marketing');
  assert.equal(before.member, 'tester');

  const view = await revokeTeamKey(key.id);
  assert.equal(view?.active, false);

  const after = await verifyTeamKey(rawKey);
  assert.equal(after.valid, false, 'a revoked key must not verify');
  assert.equal(after.reason, 'revoked');
});

test('the raw key is never recoverable from the store', async () => {
  const { rawKey } = await issueTeamKey({ label: 'ci', member: 'ci', role: 'dev' });
  const secret = rawKey.split('_')[2]!;

  // The whole file, not just the API surface: a dump is what an attacker gets.
  const dump = readFileSync(STORE_PATH, 'utf8');
  assert.equal(dump.includes(secret), false, 'the secret is sitting in the store in the clear');
  assert.equal(dump.includes(rawKey), false);

  const listed = await listTeamKeys();
  assert.equal(JSON.stringify(listed).includes(secret), false, 'the list endpoint leaks the secret');
});

test('every bad key fails closed', async () => {
  const { key, rawKey } = await issueTeamKey({ label: 'real', member: 'real', role: 'dev' });
  const [, id, secret] = rawKey.split('_') as [string, string, string];

  const cases: Array<[string, string, string]> = [
    ['no prefix', `${id}_${secret}`, 'malformed'],
    ['wrong prefix', `karwn_${id}_${secret}`, 'malformed'],
    ['empty secret', `karwan_${id}_`, 'malformed'],
    ['unknown id', `karwan_00000000-0000-0000-0000-000000000000_${secret}`, 'unknown'],
    ['right id, wrong secret', `karwan_${id}_notthesecret`, 'mismatch'],
    ['secret used as id', `karwan_${secret}_${id}`, 'unknown'],
  ];

  for (const [name, candidate, reason] of cases) {
    const result = await verifyTeamKey(candidate);
    assert.equal(result.valid, false, `${name} verified when it should not have`);
    assert.equal(result.reason, reason, `${name} failed for the wrong reason`);
  }

  // The real key still works. The failures above must not have damaged it.
  assert.equal((await verifyTeamKey(rawKey)).valid, true);
  assert.equal(key.id, id);
});

test('two keys issued with identical details are still distinct keys', async () => {
  const a = await issueTeamKey({ label: 'same', member: 'same', role: 'dev' });
  const b = await issueTeamKey({ label: 'same', member: 'same', role: 'dev' });

  assert.notEqual(a.rawKey, b.rawKey);
  await revokeTeamKey(a.key.id);

  assert.equal((await verifyTeamKey(a.rawKey)).valid, false);
  assert.equal((await verifyTeamKey(b.rawKey)).valid, true, 'revoking one key killed another');
});

test('a secret containing the delimiter still verifies', async () => {
  // base64url's alphabet includes '_', so roughly half of all issued secrets
  // contain one. Parsing the key by splitting on every underscore rejected
  // exactly those, which is a coin-flip failure at issue time and invisible
  // until someone's key never works. Draw until we get one, then prove it works.
  let withDelimiter: string | null = null;
  for (let i = 0; i < 40 && !withDelimiter; i++) {
    const { rawKey } = await issueTeamKey({ label: 'draw', member: 'draw', role: 'dev' });
    if (rawKey.split('_').length > 3) withDelimiter = rawKey;
  }

  assert.ok(withDelimiter, 'never drew a secret containing an underscore in 40 tries');
  const result = await verifyTeamKey(withDelimiter);
  assert.equal(result.valid, true, 'a secret containing an underscore failed to verify');
});

test('revoking twice keeps the moment access actually ended', async () => {
  const { key } = await issueTeamKey({ label: 'x', member: 'x', role: 'dev' });
  const first = await revokeTeamKey(key.id);
  const second = await revokeTeamKey(key.id);
  assert.equal(first?.revokedAt, second?.revokedAt);
});
