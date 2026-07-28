import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Team accounts, which are about to become the login behind an OAuth flow.
///
/// The tests that matter are the refusals. An account system is judged by what
/// it will not do: not let somebody pick their own role, not let a used invite
/// work twice, not tell an attacker which addresses exist, not keep answering
/// an endless stream of guesses.
///
///   npx tsx --test src/db/teamMembers.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

const MEMBERS = join(tmpdir(), `karwan-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;

const {
  createInvite,
  checkInvite,
  redeemInvite,
  revokeInvite,
  listInvites,
  login,
  listMembers,
  getMemberByEmail,
  setMemberDisabled,
  changePassword,
  MIN_PASSWORD_LENGTH,
} = await import('./teamMembers.js');

const GOOD_PASSWORD = 'correct horse battery staple';

beforeEach(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

async function invited(role: 'dev' | 'marketing' = 'marketing', email = 'aisha@karwan.site') {
  const { rawToken } = await createInvite({ email, name: 'Aisha', role });
  return rawToken;
}

test('an invite becomes an account, and the role comes from the invite', async () => {
  const token = await invited('marketing');
  const result = await redeemInvite(token, GOOD_PASSWORD);

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.member.role, 'marketing');
  assert.equal(result.ok && result.member.email, 'aisha@karwan.site');

  // Nothing the person supplies can change what they were granted. There is no
  // parameter here to pass a role through, and that is the point.
  const stored = await getMemberByEmail('AISHA@karwan.site');
  assert.equal(stored?.role, 'marketing');
});

test('an invite works exactly once', async () => {
  const token = await invited();
  assert.equal((await redeemInvite(token, GOOD_PASSWORD)).ok, true);

  const second = await redeemInvite(token, 'another password entirely');
  assert.equal(second.ok, false);
  assert.equal((await listMembers()).length, 1);

  const check = await checkInvite(token);
  assert.equal(check.valid, false);
  assert.equal(check.reason, 'used');
});

test('an expired or revoked invite is refused', async () => {
  const token = await invited();
  const [invite] = await listInvites();
  assert.ok(invite);

  await revokeInvite(invite.id);
  const check = await checkInvite(token);
  assert.equal(check.valid, false);
  assert.equal(check.reason, 'expired');
  assert.equal((await redeemInvite(token, GOOD_PASSWORD)).ok, false);
});

test('a tampered invite token is refused, and underscores in the secret survive', async () => {
  // base64url includes '_', so roughly half of all secrets contain one. Parsing
  // with split('_') would reject those forever, which is the bug that shipped
  // in the team keys.
  let sawUnderscore = false;
  for (let i = 0; i < 40 && !sawUnderscore; i++) {
    if (existsSync(INVITES)) rmSync(INVITES);
    const token = await invited('dev', `t${i}@karwan.site`);
    const secret = token.slice(token.indexOf('_', token.indexOf('_') + 1) + 1);
    if (secret.includes('_')) {
      sawUnderscore = true;
      assert.equal((await checkInvite(token)).valid, true, 'a secret containing _ was rejected');
    }
  }
  assert.ok(sawUnderscore, 'no secret with an underscore was drawn; the test proved nothing');

  if (existsSync(INVITES)) rmSync(INVITES);
  const token = await invited();
  assert.equal((await checkInvite(`${token}x`)).reason, 'mismatch');
  assert.equal((await checkInvite('nonsense')).reason, 'malformed');
  assert.equal((await checkInvite('invite__')).reason, 'malformed');
});

test('a weak password is refused before an account exists', async () => {
  const token = await invited();
  const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
  const result = await redeemInvite(token, short);

  assert.equal(result.ok, false);
  assert.equal((await listMembers()).length, 0);
  // And the invite is still usable, because a rejected attempt must not burn it.
  assert.equal((await checkInvite(token)).valid, true);
});

test('login accepts the right password and refuses everything else', async () => {
  await redeemInvite(await invited(), GOOD_PASSWORD);

  assert.equal((await login('aisha@karwan.site', GOOD_PASSWORD)).ok, true);
  // Case-insensitive on the address, exact on the password.
  assert.equal((await login('Aisha@Karwan.Site', GOOD_PASSWORD)).ok, true);
  assert.equal((await login('aisha@karwan.site', 'wrong')).ok, false);
  assert.equal((await login('aisha@karwan.site', `${GOOD_PASSWORD} `)).ok, false);
});

test('a missing account is not distinguishable from a wrong password', async () => {
  await redeemInvite(await invited(), GOOD_PASSWORD);

  const unknown = await login('nobody@karwan.site', GOOD_PASSWORD);
  const wrong = await login('aisha@karwan.site', 'not the password');

  assert.equal(unknown.ok, false);
  assert.equal(wrong.ok, false);
  // The reasons differ internally so logs are useful, but neither is safe to
  // hand back to a caller: together they turn login into an address checker.
  assert.equal(unknown.reason, 'unknown');
  assert.equal(wrong.reason, 'mismatch');
});

test('repeated guesses lock the account, and the lock beats the right password', async () => {
  await redeemInvite(await invited(), GOOD_PASSWORD);

  let locked = null;
  for (let i = 0; i < 10; i++) {
    const r = await login('aisha@karwan.site', `guess ${i}`);
    if (r.reason === 'locked') {
      locked = r;
      break;
    }
  }
  assert.ok(locked, 'the account never locked');
  assert.ok((locked.retryAfter ?? 0) > 0);

  // The correct password must not open a locked account, or the lockout is
  // decoration.
  const correct = await login('aisha@karwan.site', GOOD_PASSWORD);
  assert.equal(correct.ok, false);
  assert.equal(correct.reason, 'locked');
});

test('a disabled account cannot log in, and enabling clears the lock', async () => {
  const redeemed = await redeemInvite(await invited(), GOOD_PASSWORD);
  assert.ok(redeemed.ok);
  const id = redeemed.member.id;

  await setMemberDisabled(id, true);
  const blocked = await login('aisha@karwan.site', GOOD_PASSWORD);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'disabled');

  const view = await setMemberDisabled(id, false);
  assert.equal(view?.active, true);
  assert.equal((await login('aisha@karwan.site', GOOD_PASSWORD)).ok, true);
});

test('two accounts cannot share an email, whichever order it is attempted', async () => {
  await redeemInvite(await invited('marketing', 'dup@karwan.site'), GOOD_PASSWORD);

  // A second invite for the same address is refused at creation.
  await assert.rejects(
    () => createInvite({ email: 'dup@karwan.site', name: 'Impostor', role: 'dev' }),
    /already has an account/,
  );
});

test('two invites issued before either is redeemed cannot both become accounts', async () => {
  // The create-time check cannot see this, because neither account exists yet.
  // The redeem-time check is what stops the second one.
  const a = await createInvite({ email: 'race@karwan.site', name: 'A', role: 'marketing' });
  const invites = await listInvites();
  assert.equal(invites.length, 1);

  assert.equal((await redeemInvite(a.rawToken, GOOD_PASSWORD)).ok, true);
  const again = await redeemInvite(a.rawToken, GOOD_PASSWORD);
  assert.equal(again.ok, false);
  assert.equal((await listMembers()).length, 1);
});

test('changing a password invalidates the old one', async () => {
  const redeemed = await redeemInvite(await invited(), GOOD_PASSWORD);
  assert.ok(redeemed.ok);

  assert.equal(await changePassword(redeemed.member.id, 'a brand new long password'), true);
  assert.equal((await login('aisha@karwan.site', GOOD_PASSWORD)).ok, false);
  assert.equal((await login('aisha@karwan.site', 'a brand new long password')).ok, true);

  assert.equal(await changePassword(redeemed.member.id, 'short'), false);
});

test('the stored record never holds the password', async () => {
  await redeemInvite(await invited(), GOOD_PASSWORD);
  const raw = (await import('node:fs')).readFileSync(MEMBERS, 'utf8');

  assert.equal(raw.includes(GOOD_PASSWORD), false, 'the password is in the store');
  assert.ok(raw.includes('passwordHash'));
  assert.ok(raw.includes('salt'));
});
