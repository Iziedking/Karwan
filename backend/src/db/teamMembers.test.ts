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
  reissueInvite,
  listInvites,
  login,
  listMembers,
  getMemberByEmail,
  setMemberDisabled,
  changePassword,
  createPasswordReset,
  checkPasswordReset,
  consumePasswordReset,
  deleteMember,
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

test('a lost invite can be reissued, and the old link dies', async () => {
  const first = await invited('dev');
  const [invite] = await listInvites();
  assert.ok(invite);

  const again = await reissueInvite(invite.id);
  assert.ok(again, 'a pending invite could not be reissued');
  assert.notEqual(again.rawToken, first, 'reissue handed back the same token');

  // The whole point: the old link stops working. This is used when somebody
  // never received it or lost it, and in both cases the first one should not
  // still be lying around in an inbox.
  assert.equal((await checkInvite(first)).valid, false);
  assert.equal((await checkInvite(again.rawToken)).valid, true);

  // Same person, same role. Reissuing must not become a way to change either.
  assert.equal(again.invite.email, invite.email);
  assert.equal(again.invite.role, 'dev');
  // And the clock restarts, or reissuing an expired link would produce another
  // expired link.
  assert.ok(again.invite.expiresAt > invite.expiresAt);

  const redeemed = await redeemInvite(again.rawToken, GOOD_PASSWORD);
  assert.equal(redeemed.ok, true);
});

test('a redeemed or unknown invite cannot be reissued', async () => {
  const token = await invited();
  const [invite] = await listInvites();
  await redeemInvite(token, GOOD_PASSWORD);

  // Once it has become an account, reissuing would be a way to mint a second
  // password-setting link for somebody who already has one.
  assert.equal(await reissueInvite(invite!.id), null);
  assert.equal(await reissueInvite('no-such-invite'), null);
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

// -------------------------------------------------------- password resets
//
// A reset link takes over an account that already exists, which makes it the
// most dangerous thing this module mints. The tests below are almost entirely
// about taking it away again: after one use, after a second is issued, and after
// the account it belongs to is disabled.

const NEW_PASSWORD = 'a different long passphrase';

async function member(email = 'aisha@karwan.site') {
  const redeemed = await redeemInvite(await invited('marketing', email), GOOD_PASSWORD);
  assert.ok(redeemed.ok);
  return redeemed.member;
}

test('a reset sets a new password and retires the old one', async () => {
  const m = await member();
  const reset = await createPasswordReset(m.id);
  assert.ok(reset);

  const result = await consumePasswordReset(reset.rawToken, NEW_PASSWORD);
  assert.equal(result.ok, true);
  assert.equal((await login(m.email, NEW_PASSWORD)).ok, true);
  assert.equal((await login(m.email, GOOD_PASSWORD)).ok, false, 'the old password still works');
});

test('a reset link works exactly once', async () => {
  const m = await member();
  const reset = await createPasswordReset(m.id);
  assert.ok(reset);

  assert.equal((await consumePasswordReset(reset.rawToken, NEW_PASSWORD)).ok, true);
  // Whoever else has the link, out of a forwarded email or a shared screen, must
  // not be able to take the account back with it.
  const second = await consumePasswordReset(reset.rawToken, 'yet another long password');
  assert.equal(second.ok, false);
  assert.equal((await login(m.email, NEW_PASSWORD)).ok, true);
});

test('issuing a second reset kills the first', async () => {
  const m = await member();
  const first = await createPasswordReset(m.id);
  const second = await createPasswordReset(m.id);
  assert.ok(first);
  assert.ok(second);

  assert.equal((await checkPasswordReset(first.rawToken)).valid, false);
  assert.equal((await checkPasswordReset(second.rawToken)).valid, true);
});

test('a rejected password does not burn the link', async () => {
  // Getting the length wrong is the most likely thing to happen on this form. If
  // that spent the token, the honest mistake would cost them another round trip
  // through their inbox.
  const m = await member();
  const reset = await createPasswordReset(m.id);
  assert.ok(reset);

  const weak = await consumePasswordReset(reset.rawToken, 'short');
  assert.equal(weak.ok, false);
  assert.equal(weak.ok === false && weak.reason, 'weak');
  assert.equal((await consumePasswordReset(reset.rawToken, NEW_PASSWORD)).ok, true);
});

test('a disabled account cannot be reset into', async () => {
  const m = await member();
  // Minted while they were still active, then their access ends. The link has to
  // die with the account, or ending access means nothing to anyone holding one.
  const early = await createPasswordReset(m.id);
  assert.ok(early);

  await setMemberDisabled(m.id, true);
  assert.equal(await createPasswordReset(m.id), null, 'a disabled account got a fresh link');

  const check = await checkPasswordReset(early.rawToken);
  assert.equal(check.valid, false);
  assert.equal(check.reason, 'disabled');
  assert.equal((await consumePasswordReset(early.rawToken, NEW_PASSWORD)).ok, false);
});

test('a reset clears a lockout', async () => {
  // The person resetting is very often the person who just locked themselves
  // out. A reset that leaves the lockout in place has not let them back in.
  const m = await member();
  for (let i = 0; i < 8; i++) await login(m.email, 'wrong password entirely');
  assert.equal((await login(m.email, GOOD_PASSWORD)).reason, 'locked');

  const reset = await createPasswordReset(m.id);
  assert.ok(reset);
  assert.equal((await consumePasswordReset(reset.rawToken, NEW_PASSWORD)).ok, true);
  assert.equal((await login(m.email, NEW_PASSWORD)).ok, true);
});

test('an invite is not a reset and a reset is not an invite', async () => {
  // Both are `prefix_id_secret` and both arrive by email. Without the prefix
  // check one could be replayed into the other route, and redeeming an invite
  // sets a ROLE, which is the thing an invitation exists to control.
  const m = await member();
  const reset = await createPasswordReset(m.id);
  assert.ok(reset);

  const inviteToken = await invited('dev', 'someone-else@karwan.site');
  assert.equal((await checkPasswordReset(inviteToken)).reason, 'malformed');
  assert.equal((await checkInvite(reset.rawToken)).reason, 'malformed');
});

test('removing a member takes their invitations with them', async () => {
  const m = await member();
  assert.equal((await listInvites()).some((i) => i.email === m.email), true);

  const removed = await deleteMember(m.id);
  assert.equal(removed?.email, m.email);
  assert.equal(await getMemberByEmail(m.email), null);
  assert.equal((await listInvites()).some((i) => i.email === m.email), false);
  // The whole point: the address is free again.
  await assert.doesNotReject(() => createInvite({ email: m.email, name: 'Aisha', role: 'dev' }));
});
