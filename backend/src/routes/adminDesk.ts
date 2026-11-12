import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { adminDeskStore, deskPrincipal, deskNetwork, deskSecret, requireAdmin, writeDeskRow } from '../middleware/adminAuth.js';
import { getMember, listMembers, login, revokeDesk, setCodeSecret, setDeskPages, setDeskAccess, type TeamMember } from '../db/teamMembers.js';
import { makeDeskKey, toKeyView } from '../db/adminDesk.js';
import { mintDeskSession, mintDeskTicket, readDeskTicket } from '../ops/deskSession.js';
import { checkCode, newCodeSecret, openSecret, otpauthUri, sealSecret } from '../ops/deskCode.js';
import { codeLockedUntil, lastCodeStep, recordCode } from '../db/deskSignIn.js';
import { config } from '../config.js';
import { ADMIN_PAGES, cleanPages, accessFor, cleanAccess, type DeskLevel } from '../ops/adminPages.js';
import { readSharedRates } from '../rates/sharedRate.js';
import type { UsdcRates } from '../rates/usdcRates.js';

/// The desk's own routes (view 64): sign-in, who is signed in, the owner's
/// ticks per member, a member's keys for scripts, and the change log. Mounted
/// before the other admin groups so sign-in is not held behind a session.

export const adminDeskRoutes = new Hono();

const signInSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(500) });

adminDeskRoutes.post('/session', rateLimit({ windowMs: 60_000, max: 10, name: 'admin-desk-sign-in' }), async (c) => {
  const parsed = signInSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Email and password are needed.' }, 400);
  const email = parsed.data.email.trim().toLowerCase();
  const refuse = async (why: string, status: 401 | 403 | 429, extra: Record<string, unknown> = {}) => {
    await writeDeskRow({ memberId: null, memberEmail: email, via: 'sign-in', method: 'POST', path: '/api/admin/session', outcome: 'refused', status, request: { email }, result: { error: why } });
    return c.json({ error: why, ...extra }, status);
  };
  const accessEmail = (c.get('accessEmail' as never) as string | null | undefined) ?? null;
  if (accessEmail && accessEmail !== email) return refuse('Sign in with the email Cloudflare let in.', 403);

  const result = await login(email, parsed.data.password);
  if (!result.ok) {
    if (result.reason === 'locked') return refuse('Too many tries. Wait and try again.', 429, { retryAfter: result.retryAfter });
    return refuse('That email and password do not match a desk member.', 401);
  }
  const member = result.member;
  if (!member) return refuse('That email and password do not match a desk member.', 401);
  if (!member.deskOwner && !Object.keys(accessFor(member)).length) return refuse('The owner has not given you any desk pages.', 403);

  if (deskNetwork() === 'mainnet') {
    // Mainnet asks for the authenticator code after the password (view 79).
    if (!config.DESK_CODE_KEY) return refuse('The mainnet code is not set up on this server yet.', 403);
    if (codeLockedUntil(email, Date.now())) return refuse('Too many wrong codes. Wait 15 minutes.', 429);
    if (member.codeSecret) return c.json({ step: 'code', ticket: mintDeskTicket(member.id, 'mainnet', deskSecret(), Date.now()) });
    const secret = newCodeSecret();
    const sealed = sealSecret(secret, config.DESK_CODE_KEY);
    return c.json({ step: 'setup', ticket: mintDeskTicket(member.id, 'mainnet', deskSecret(), Date.now(), sealed), otpauth: otpauthUri(member.email, secret) });
  }
  return signedIn(c, member, email);
});

async function signedIn(c: Context, member: TeamMember, email: string) {
  const { token, expiresAt } = mintDeskSession(member, deskSecret(), Date.now(), deskNetwork());
  await writeDeskRow({ memberId: member.id, memberEmail: member.email, via: 'sign-in', method: 'POST', path: '/api/admin/session', outcome: 'done', status: 200, request: { email }, result: { expiresAt } });
  return c.json({ token, expiresAt, me: me(member) });
}

/// Five wrong codes go to the team's Telegram chat; tests listen instead.
let deskAlert: (text: string) => Promise<void> = async (text) => {
  const { tellTeamChat } = await import('../telegram/bot.js');
  await tellTeamChat(text);
};
export function useDeskAlertForTests(fn: (text: string) => Promise<void>): void {
  deskAlert = fn;
}

function lagosTime(at: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

const codeSchema = z.object({ ticket: z.string().min(10).max(2000), code: z.string().min(1).max(20) });

adminDeskRoutes.post('/session/code', rateLimit({ windowMs: 60_000, max: 20, name: 'admin-desk-code' }), async (c) => {
  const parsed = codeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Enter the 6-digit code.' }, 400);
  const now = Date.now();
  const ticket = readDeskTicket(parsed.data.ticket, deskSecret(), now, deskNetwork());
  if (!ticket || deskNetwork() !== 'mainnet' || !config.DESK_CODE_KEY) return c.json({ error: 'Sign in again.' }, 401);
  const member = await getMember(ticket.id);
  if (!member || member.disabledAt) return c.json({ error: 'Sign in again.' }, 401);
  const email = member.email.toLowerCase();
  const refuse = async (why: string, status: 401 | 429) => {
    await writeDeskRow({ memberId: member.id, memberEmail: email, via: 'sign-in', method: 'POST', path: '/api/admin/session/code', outcome: 'refused', status, request: { email }, result: { error: why } });
    return c.json({ error: why }, status);
  };
  if (codeLockedUntil(email, now)) return refuse('Too many wrong codes. Wait 15 minutes.', 429);
  const sealed = ticket.ps ?? member.codeSecret;
  if (!sealed) return c.json({ error: 'Sign in again.' }, 401);
  const checked = checkCode(openSecret(sealed, config.DESK_CODE_KEY), parsed.data.code, now, lastCodeStep(member.id, now));
  if (!checked.ok) {
    if (checked.reason === 'reused') return refuse('That code is not right.', 401);
    const { locked } = recordCode(email, member.id, false, null, now);
    if (!locked) return refuse('That code is not right.', 401);
    await deskAlert(`Desk: 5 wrong mainnet codes for ${email} at ${lagosTime(now)} Lagos. Locked 15 minutes.`).catch(() => undefined);
    return refuse('Too many wrong codes. Wait 15 minutes.', 429);
  }
  recordCode(email, member.id, true, checked.step, now);
  if (ticket.ps) await setCodeSecret(member.id, ticket.ps);
  return signedIn(c, member, email);
});

/// Signing out: the desk's address drops its cookies. Sessions are not stored,
/// so there is nothing here to delete.
adminDeskRoutes.delete('/session', (c) => c.json({ ok: true }));

function me(m: { id: string; name: string; email: string; deskOwner?: boolean; deskPages?: string[]; deskAccess?: Record<string, DeskLevel> }) {
  const access = m.deskOwner ? Object.fromEntries(ADMIN_PAGES.map((p) => [p.key, 'fix' as const])) : accessFor(m);
  return { id: m.id, name: m.name, email: m.email, owner: m.deskOwner === true, pages: Object.keys(access), access };
}

adminDeskRoutes.get('/session', requireAdmin, async (c) => {
  const p = deskPrincipal(c)!;
  if (!p.memberId) {
    const access = p.owner ? Object.fromEntries(ADMIN_PAGES.map((x) => [x.key, 'fix' as const])) : p.access;
    return c.json({ me: { id: null, name: p.name, email: null, owner: p.owner, pages: Object.keys(access), access }, network: deskNetwork() });
  }
  const member = await getMember(p.memberId);
  return c.json({ me: member ? me(member) : null, network: deskNetwork() });
});

let deskRates: () => Promise<UsdcRates> = () => readSharedRates();

export function useDeskRatesForTests(fn: () => Promise<UsdcRates>): void {
  deskRates = fn;
}

/// The shared rate on this desk's own network, for Show amounts in (view 79).
adminDeskRoutes.get('/rates', requireAdmin, async (c) => c.json(await deskRates()));

// ---------------------------------------------------------------- the owner's ticks

adminDeskRoutes.get('/access', requireAdmin, async (c) => {
  const members = (await listMembers()).filter((m) => m.active);
  return c.json({
    pages: ADMIN_PAGES.map((p) => ({ key: p.key, label: p.label })),
    members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, owner: m.deskOwner, pages: m.deskPages, access: accessFor({ deskPages: m.deskPages, deskAccess: m.deskAccess ?? undefined }), lastLoginAt: m.lastLoginAt })),
  });
});

const pagesSchema = z.union([
  z.object({ access: z.record(z.string().max(40), z.enum(['read', 'change', 'fix'])) }),
  z.object({ pages: z.array(z.string().max(40)).max(64) }),
]);

async function targetMember(c: Context) {
  const target = await getMember(c.req.param('id') ?? '');
  if (!target) return { error: c.json({ error: 'No such member.' }, 404) };
  if (target.deskOwner) return { error: c.json({ error: 'The owner’s access is not changed from the desk.' }, 409) };
  return { target };
}

adminDeskRoutes.put('/access/:id', requireAdmin, async (c) => {
  const parsed = pagesSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Send the level for each page, or a list of pages.' }, 400);
  const { target, error } = await targetMember(c);
  if (error) return error;
  const view =
    'access' in parsed.data
      ? await setDeskAccess(target.id, cleanAccess(parsed.data.access))
      : await setDeskPages(target.id, cleanPages(parsed.data.pages));
  return c.json({ member: view });
});

adminDeskRoutes.post('/access/:id/revoke', requireAdmin, async (c) => {
  const { target, error } = await targetMember(c);
  if (error) return error;
  const view = await revokeDesk(target.id);
  const keysEnded = await adminDeskStore().revokeKeysOf(target.id, Date.now());
  return c.json({ member: view, keysEnded });
});

// ---------------------------------------------------------------- keys for scripts

adminDeskRoutes.get('/keys', requireAdmin, async (c) => {
  const p = deskPrincipal(c)!;
  if (!p.memberId && !p.owner) return c.json({ keys: [] });
  const keys = await adminDeskStore().listKeys(p.owner ? undefined : p.memberId!);
  return c.json({ keys: keys.map(toKeyView) });
});

const keySchema = z.object({ label: z.string().min(1).max(80) });

adminDeskRoutes.post('/keys', requireAdmin, async (c) => {
  const p = deskPrincipal(c)!;
  if (!p.memberId) return c.json({ error: 'Sign in as a member to make a key.' }, 403);
  const parsed = keySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'A label is needed.' }, 400);
  const member = await getMember(p.memberId);
  if (!member) return c.json({ error: 'No such member.' }, 404);
  const { key, rawKey } = await makeDeskKey({ memberId: member.id, label: parsed.data.label, deskEpoch: member.deskEpoch ?? 0, now: Date.now() });
  await adminDeskStore().insertKey(key);
  return c.json({ key: toKeyView(key), rawKey, note: 'Copy this now. It is not stored and cannot be shown again.' });
});

adminDeskRoutes.delete('/keys/:id', requireAdmin, async (c) => {
  const p = deskPrincipal(c)!;
  const key = await adminDeskStore().getKey(c.req.param('id') ?? '');
  if (!key || (!p.owner && key.memberId !== p.memberId)) return c.json({ error: 'No such key.' }, 404);
  const ended = await adminDeskStore().revokeKey(key.id, Date.now());
  return c.json({ key: ended ? toKeyView(ended) : null });
});

// ---------------------------------------------------------------- the change log

adminDeskRoutes.get('/actions', requireAdmin, async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50));
  const beforeRaw = c.req.query('before');
  const before = beforeRaw && /^\d+$/.test(beforeRaw) ? Number(beforeRaw) : undefined;
  return c.json({ actions: await adminDeskStore().listActions({ limit, ...(before !== undefined ? { before } : {}) }) });
});
