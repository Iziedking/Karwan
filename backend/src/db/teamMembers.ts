import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { teamMembers, teamInvites } from './schema.js';
import { durableEphemeralMap } from './ephemeral.js';
import type { TeamRole } from './teamKeys.js';

const scryptAsync = promisify(scrypt);

/// Team accounts, for people rather than machines.
///
/// A key identifies a client. This identifies a person, which is what an OAuth
/// login needs: somebody types a password, approves a client, and the token that
/// comes out carries their role.
///
/// THE ROLE IS NEVER CHOSEN BY THE PERSON SIGNING UP. It arrives on an invite
/// that an admin created. Self-selection would mean anyone who found the page
/// could mint themselves a dev account and read the decisions log, which is
/// precisely what the role split exists to prevent. There is no open signup
/// path in this module, by design.

export interface TeamMember {
  id: string;
  /// Lowercased. The login identifier and the only unique human-facing field.
  email: string;
  name: string;
  role: TeamRole;
  passwordHash: string;
  salt: string;
  createdAt: number;
  lastLoginAt?: number;
  /// Set to lock the account out. Everything derived from it dies with it:
  /// tokens are checked against the account on every use.
  disabledAt?: number;
  /// Consecutive failures. Cleared on success.
  failedLogins: number;
  /// Epoch ms until which login is refused regardless of the password.
  lockedUntil?: number;
}

export interface TeamMemberView {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  createdAt: number;
  lastLoginAt: number | null;
  disabledAt: number | null;
  active: boolean;
  locked: boolean;
}

export function toMemberView(m: TeamMember): TeamMemberView {
  return {
    id: m.id,
    email: m.email,
    name: m.name,
    role: m.role,
    createdAt: m.createdAt,
    lastLoginAt: m.lastLoginAt ?? null,
    disabledAt: m.disabledAt ?? null,
    active: !m.disabledAt,
    locked: !!m.lockedUntil && m.lockedUntil > Date.now(),
  };
}

/// An unredeemed invitation. Carries the role, so redeeming it cannot change it.
export interface TeamInvite {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  /// scrypt of the secret half of the invite link. The raw value is shown once.
  tokenHash: string;
  salt: string;
  createdAt: number;
  expiresAt: number;
  redeemedAt?: number;
  redeemedBy?: string;
}

const MEMBERS_PATH = process.env.TEAM_MEMBERS_STORE_PATH
  ? resolve(process.env.TEAM_MEMBERS_STORE_PATH)
  : resolve(process.cwd(), 'data', 'team-members.json');
const INVITES_PATH = process.env.TEAM_INVITES_STORE_PATH
  ? resolve(process.env.TEAM_INVITES_STORE_PATH)
  : resolve(process.cwd(), 'data', 'team-invites.json');

/// Long enough that guessing is not a strategy, short enough to type once.
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 12;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60_000;

async function hash(secret: string, salt: string): Promise<string> {
  const derived = (await scryptAsync(secret, salt, 32)) as Buffer;
  return derived.toString('hex');
}

/// Constant time, and length-checked first because timingSafeEqual throws on a
/// mismatch rather than returning false.
function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- invites

/// Create an invitation. Returns the raw token once; it is not recoverable.
export async function createInvite(input: {
  email: string;
  name: string;
  role: TeamRole;
}): Promise<{ invite: TeamInvite; rawToken: string }> {
  const email = input.email.trim().toLowerCase();
  if (await getMemberByEmail(email)) {
    throw new Error('somebody with that email already has an account');
  }

  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const salt = randomBytes(16).toString('hex');

  const invite: TeamInvite = {
    id,
    email,
    name: input.name.trim(),
    role: input.role,
    tokenHash: await hash(secret, salt),
    salt,
    createdAt: Date.now(),
    expiresAt: Date.now() + INVITE_TTL_MS,
  };

  await persistInvite(invite);
  // Same shape as a team key: the id addresses the row, the secret proves it.
  // Split on the first two underscores when reading, never split('_'), because
  // base64url contains underscores.
  return { invite, rawToken: `invite_${id}_${secret}` };
}

export interface InviteCheck {
  valid: boolean;
  invite?: TeamInvite;
  reason?: 'malformed' | 'unknown' | 'expired' | 'used' | 'mismatch';
}

export async function checkInvite(rawToken: string): Promise<InviteCheck> {
  const first = rawToken.indexOf('_');
  const second = first < 0 ? -1 : rawToken.indexOf('_', first + 1);
  if (first < 0 || second < 0) return { valid: false, reason: 'malformed' };

  const prefix = rawToken.slice(0, first);
  const id = rawToken.slice(first + 1, second);
  const secret = rawToken.slice(second + 1);
  if (prefix !== 'invite' || !id || !secret) return { valid: false, reason: 'malformed' };

  const invite = await getInvite(id);
  if (!invite) return { valid: false, reason: 'unknown' };
  if (invite.redeemedAt) return { valid: false, reason: 'used' };
  if (invite.expiresAt < Date.now()) return { valid: false, reason: 'expired' };

  const candidate = await hash(secret, invite.salt);
  if (!sameHash(candidate, invite.tokenHash)) return { valid: false, reason: 'mismatch' };

  return { valid: true, invite };
}

/// Redeem an invite into an account. The role comes from the invite and the
/// caller cannot influence it.
export async function redeemInvite(
  rawToken: string,
  password: string,
): Promise<{ ok: true; member: TeamMember } | { ok: false; reason: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `a password needs at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const check = await checkInvite(rawToken);
  if (!check.valid || !check.invite) {
    return { ok: false, reason: check.reason ?? 'this invitation is not valid' };
  }

  const invite = check.invite;
  // Re-check at redeem time, not only at create time: two invites could have
  // been issued for the same address before either was used.
  if (await getMemberByEmail(invite.email)) {
    return { ok: false, reason: 'somebody with that email already has an account' };
  }

  const salt = randomBytes(16).toString('hex');
  const member: TeamMember = {
    id: randomUUID(),
    email: invite.email,
    name: invite.name,
    role: invite.role,
    passwordHash: await hash(password, salt),
    salt,
    createdAt: Date.now(),
    failedLogins: 0,
  };

  await persistMember(member);
  await persistInvite({ ...invite, redeemedAt: Date.now(), redeemedBy: member.id });
  return { ok: true, member };
}

/// Mint a fresh token for an invitation that already exists.
///
/// The link is shown once at creation because only its hash is stored, which is
/// what keeps a database dump from being a set of working invitations. That
/// makes "I lost the link" unanswerable, so this answers it instead: a new
/// secret for the same invitation, same person, same role, and the old link
/// stops working immediately.
///
/// Not a security hole. Anyone who can call this already has admin access and
/// could simply create another invitation; the only thing being avoided is a
/// pointless round of revoke-and-recreate.
export async function reissueInvite(
  id: string,
): Promise<{ invite: TeamInvite; rawToken: string } | null> {
  const existing = await getInvite(id);
  if (!existing || existing.redeemedAt) return null;

  const secret = randomBytes(32).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const invite: TeamInvite = {
    ...existing,
    tokenHash: await hash(secret, salt),
    salt,
    // The clock restarts. A link reissued because the first expired that is
    // itself already expired would be a joke.
    expiresAt: Date.now() + INVITE_TTL_MS,
  };

  await persistInvite(invite);
  return { invite, rawToken: `invite_${id}_${secret}` };
}

export async function listInvites(): Promise<TeamInvite[]> {
  const all = pgEnabled
    ? (await db().select().from(teamInvites)).map((r) => r.data)
    : Object.values(loadInvites());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeInvite(id: string): Promise<boolean> {
  const invite = await getInvite(id);
  if (!invite || invite.redeemedAt) return false;
  // Expiring it is the revocation: a redeemed invite keeps its history, and an
  // unredeemed one becomes unusable without disappearing from the audit trail.
  await persistInvite({ ...invite, expiresAt: 0 });
  return true;
}

// ---------------------------------------------------------------- accounts

export interface LoginResult {
  ok: boolean;
  member?: TeamMember;
  reason?: 'unknown' | 'disabled' | 'locked' | 'mismatch';
  /// Seconds until a locked account can try again.
  retryAfter?: number;
}

/// Verify an email and password.
///
/// Fails closed on every path, and does the same work whether or not the
/// account exists: a wrong address and a wrong password should not be
/// distinguishable by how long the answer takes.
export async function login(email: string, password: string): Promise<LoginResult> {
  const member = await getMemberByEmail(email.trim().toLowerCase());

  if (!member) {
    // Burn comparable time so a missing account does not answer faster than a
    // wrong password, which would turn this into an account enumerator.
    await hash(password, randomBytes(16).toString('hex'));
    return { ok: false, reason: 'unknown' };
  }
  if (member.disabledAt) return { ok: false, reason: 'disabled' };
  if (member.lockedUntil && member.lockedUntil > Date.now()) {
    return {
      ok: false,
      reason: 'locked',
      retryAfter: Math.ceil((member.lockedUntil - Date.now()) / 1000),
    };
  }

  const candidate = await hash(password, member.salt);
  if (!sameHash(candidate, member.passwordHash)) {
    const failed = member.failedLogins + 1;
    const next: TeamMember = {
      ...member,
      failedLogins: failed,
      ...(failed >= MAX_FAILED_LOGINS ? { lockedUntil: Date.now() + LOCKOUT_MS } : {}),
    };
    await persistMember(next);
    return { ok: false, reason: 'mismatch' };
  }

  const next: TeamMember = {
    ...member,
    failedLogins: 0,
    lastLoginAt: Date.now(),
  };
  delete next.lockedUntil;
  await persistMember(next);
  return { ok: true, member: next };
}

export async function getMember(id: string): Promise<TeamMember | null> {
  if (pgEnabled) {
    const rows = await db().select().from(teamMembers).where(eq(teamMembers.id, id));
    return rows[0]?.data ?? null;
  }
  return loadMembers()[id] ?? null;
}

export async function getMemberByEmail(email: string): Promise<TeamMember | null> {
  const wanted = email.trim().toLowerCase();
  const all = pgEnabled
    ? (await db().select().from(teamMembers)).map((r) => r.data)
    : Object.values(loadMembers());
  return all.find((m) => m.email === wanted) ?? null;
}

export async function listMembers(): Promise<TeamMemberView[]> {
  const all = pgEnabled
    ? (await db().select().from(teamMembers)).map((r) => r.data)
    : Object.values(loadMembers());
  return all.sort((a, b) => b.createdAt - a.createdAt).map(toMemberView);
}

/// Disable an account. Idempotent, and the timestamp is when access actually
/// ended, so re-disabling does not move it.
export async function setMemberDisabled(
  id: string,
  disabled: boolean,
): Promise<TeamMemberView | null> {
  const member = await getMember(id);
  if (!member) return null;
  if (disabled && member.disabledAt) return toMemberView(member);

  const next: TeamMember = { ...member, failedLogins: 0 };
  if (disabled) next.disabledAt = Date.now();
  else {
    delete next.disabledAt;
    delete next.lockedUntil;
  }
  await persistMember(next);
  return toMemberView(next);
}

/// Remove an account outright, and every invitation that produced it.
///
/// Disabling was the only exit before this, and it is not always the right one.
/// `createInvite` refuses an email that already belongs to a member, disabled or
/// not, so anyone invited by mistake, or who set a password and never came back,
/// became permanently unfixable: they could not be re-invited and could not be
/// removed. The account existed but nobody was in it.
///
/// Their invitations go too. Leaving them would keep a redeemed invite pointing
/// at an account that no longer exists, and would let an old link be reissued
/// into a fresh account with the role the ORIGINAL invite carried rather than
/// one anybody chose today.
export async function deleteMember(id: string): Promise<TeamMember | null> {
  const member = await getMember(id);
  if (!member) return null;

  if (pgEnabled) {
    await db().delete(teamMembers).where(eq(teamMembers.id, id));
    await db().delete(teamInvites).where(eq(teamInvites.email, member.email));
    return member;
  }

  const members = loadMembers();
  delete members[id];
  saveMembers(members);

  const invites = loadInvites();
  for (const [key, invite] of Object.entries(invites)) {
    if (invite.email === member.email) delete invites[key];
  }
  saveInvites(invites);
  return member;
}

// ------------------------------------------------------- password resets

/// An hour, against an invitation's week.
///
/// The two links look alike and are not alike. An invitation is expected to sit
/// in an inbox until somebody gets round to it, and it can only ever create the
/// account it was addressed to. A reset takes over an account that already
/// exists, so its window is the time it takes to walk to your email and back.
export const RESET_TTL_MS = 60 * 60 * 1000;

interface PasswordReset {
  id: string;
  memberId: string;
  tokenHash: string;
  salt: string;
  createdAt: number;
  expiresAt: number;
}

/// Ephemeral rather than a table of its own: these are short-lived, single-use,
/// and worthless once spent. The durable map already survives a restart (so a
/// deploy mid-reset does not void a link somebody is holding) and sweeps its own
/// expired rows.
const resets = durableEphemeralMap<PasswordReset>('team-password-reset');

/// Mint a reset link for a member. Returns null when there is nobody to reset,
/// or when the account is disabled: an ended account must not be recoverable by
/// whoever still has the mailbox.
export async function createPasswordReset(
  memberId: string,
): Promise<{ rawToken: string; expiresAt: number } | null> {
  const member = await getMember(memberId);
  if (!member || member.disabledAt) return null;

  // One live reset per member. Issuing a second link has to retire the first,
  // or "I clicked the old email by mistake" becomes a way for a stale link to
  // outlive the reason it was replaced.
  for (const [key, row] of [...resets.entries()]) {
    if (row.memberId === memberId) resets.delete(key);
  }

  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + RESET_TTL_MS;

  resets.set(id, {
    id,
    memberId,
    tokenHash: await hash(secret, salt),
    salt,
    createdAt: Date.now(),
    expiresAt,
  });

  // Same three-part shape as an invite, and a different prefix on purpose: a
  // reset token pasted into the invite route, or the reverse, must fail rather
  // than half-work.
  return { rawToken: `reset_${id}_${secret}`, expiresAt };
}

export interface ResetCheck {
  valid: boolean;
  member?: TeamMember;
  reason?: 'malformed' | 'unknown' | 'expired' | 'disabled';
}

export async function checkPasswordReset(rawToken: string): Promise<ResetCheck> {
  const first = rawToken.indexOf('_');
  const second = first < 0 ? -1 : rawToken.indexOf('_', first + 1);
  if (first < 0 || second < 0) return { valid: false, reason: 'malformed' };

  const prefix = rawToken.slice(0, first);
  const id = rawToken.slice(first + 1, second);
  const secret = rawToken.slice(second + 1);
  if (prefix !== 'reset' || !id || !secret) return { valid: false, reason: 'malformed' };

  const row = resets.get(id);
  // The map drops expired rows on read, so a missing row is either spent, timed
  // out, or never existed. All three are "ask for another one", and telling them
  // apart would only help somebody guessing.
  if (!row) return { valid: false, reason: 'expired' };

  const candidate = await hash(secret, row.salt);
  if (!sameHash(candidate, row.tokenHash)) return { valid: false, reason: 'unknown' };

  const member = await getMember(row.memberId);
  if (!member) return { valid: false, reason: 'unknown' };
  if (member.disabledAt) return { valid: false, reason: 'disabled' };

  return { valid: true, member };
}

/// Spend the link and set the new password.
///
/// Clears the lockout as well as the password. Somebody who has been locked out
/// by failed attempts is the single most likely person to be resetting, and a
/// reset that leaves them locked out for another fifteen minutes has not
/// actually let them in.
export async function consumePasswordReset(
  rawToken: string,
  password: string,
): Promise<
  { ok: true; member: TeamMember } | { ok: false; reason: 'invalid' | 'disabled' | 'weak' }
> {
  const check = await checkPasswordReset(rawToken);
  if (!check.valid || !check.member) {
    return { ok: false, reason: check.reason === 'disabled' ? 'disabled' : 'invalid' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'weak' };

  const id = rawToken.slice(rawToken.indexOf('_') + 1, rawToken.indexOf('_', rawToken.indexOf('_') + 1));
  resets.delete(id);

  const salt = randomBytes(16).toString('hex');
  const next: TeamMember = {
    ...check.member,
    salt,
    passwordHash: await hash(password, salt),
    failedLogins: 0,
  };
  delete next.lockedUntil;
  await persistMember(next);
  return { ok: true, member: next };
}

export async function changePassword(id: string, password: string): Promise<boolean> {
  if (password.length < MIN_PASSWORD_LENGTH) return false;
  const member = await getMember(id);
  if (!member) return false;

  const salt = randomBytes(16).toString('hex');
  await persistMember({
    ...member,
    salt,
    passwordHash: await hash(password, salt),
    failedLogins: 0,
  });
  return true;
}

// ---------------------------------------------------------------- storage

async function getInvite(id: string): Promise<TeamInvite | null> {
  if (pgEnabled) {
    const rows = await db().select().from(teamInvites).where(eq(teamInvites.id, id));
    return rows[0]?.data ?? null;
  }
  return loadInvites()[id] ?? null;
}

async function persistMember(member: TeamMember): Promise<void> {
  if (pgEnabled) {
    const existing = await getMember(member.id);
    if (existing) {
      await db()
        .update(teamMembers)
        .set({ email: member.email, role: member.role, data: member })
        .where(eq(teamMembers.id, member.id));
    } else {
      await db()
        .insert(teamMembers)
        .values({ id: member.id, email: member.email, role: member.role, data: member });
    }
    return;
  }
  const store = loadMembers();
  store[member.id] = member;
  saveMembers(store);
}

async function persistInvite(invite: TeamInvite): Promise<void> {
  if (pgEnabled) {
    const existing = await getInvite(invite.id);
    if (existing) {
      await db().update(teamInvites).set({ data: invite }).where(eq(teamInvites.id, invite.id));
    } else {
      await db().insert(teamInvites).values({ id: invite.id, email: invite.email, data: invite });
    }
    return;
  }
  const store = loadInvites();
  store[invite.id] = invite;
  saveInvites(store);
}

function ensureFile(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) writeFileSync(path, '{}', 'utf8');
}

function loadMembers(): Record<string, TeamMember> {
  ensureFile(MEMBERS_PATH);
  try {
    return JSON.parse(readFileSync(MEMBERS_PATH, 'utf8')) as Record<string, TeamMember>;
  } catch {
    return {};
  }
}

function saveMembers(store: Record<string, TeamMember>) {
  ensureFile(MEMBERS_PATH);
  writeFileSync(MEMBERS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function loadInvites(): Record<string, TeamInvite> {
  ensureFile(INVITES_PATH);
  try {
    return JSON.parse(readFileSync(INVITES_PATH, 'utf8')) as Record<string, TeamInvite>;
  } catch {
    return {};
  }
}

function saveInvites(store: Record<string, TeamInvite>) {
  ensureFile(INVITES_PATH);
  writeFileSync(INVITES_PATH, JSON.stringify(store, null, 2), 'utf8');
}
