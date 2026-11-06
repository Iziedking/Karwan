import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { adminDeskStore, deskPrincipal, deskSecret, requireAdmin, writeDeskRow } from '../middleware/adminAuth.js';
import { getMember, listMembers, login, revokeDesk, setDeskPages } from '../db/teamMembers.js';
import { makeDeskKey, toKeyView } from '../db/adminDesk.js';
import { mintDeskSession } from '../ops/deskSession.js';
import { ADMIN_PAGES, cleanPages } from '../ops/adminPages.js';

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
  if (!member.deskOwner && !(member.deskPages ?? []).length) return refuse('The owner has not given you any desk pages.', 403);

  const { token, expiresAt } = mintDeskSession(member, deskSecret(), Date.now());
  await writeDeskRow({ memberId: member.id, memberEmail: member.email, via: 'sign-in', method: 'POST', path: '/api/admin/session', outcome: 'done', status: 200, request: { email }, result: { expiresAt } });
  return c.json({ token, expiresAt, me: me(member) });
});

function me(m: { id: string; name: string; email: string; deskOwner?: boolean; deskPages?: string[] }) {
  return { id: m.id, name: m.name, email: m.email, owner: m.deskOwner === true, pages: m.deskOwner ? ADMIN_PAGES.map((p) => p.key) : (m.deskPages ?? []) };
}

adminDeskRoutes.get('/session', requireAdmin, async (c) => {
  const p = deskPrincipal(c)!;
  if (!p.memberId) return c.json({ me: { id: null, name: p.name, email: null, owner: p.owner, pages: p.owner ? ADMIN_PAGES.map((x) => x.key) : p.pages } });
  const member = await getMember(p.memberId);
  return c.json({ me: member ? me(member) : null });
});

// ---------------------------------------------------------------- the owner's ticks

adminDeskRoutes.get('/access', requireAdmin, async (c) => {
  const members = (await listMembers()).filter((m) => m.active);
  return c.json({
    pages: ADMIN_PAGES.map((p) => ({ key: p.key, label: p.label })),
    members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, owner: m.deskOwner, pages: m.deskPages, lastLoginAt: m.lastLoginAt })),
  });
});

const pagesSchema = z.object({ pages: z.array(z.string().max(40)).max(64) });

async function targetMember(c: Context) {
  const target = await getMember(c.req.param('id') ?? '');
  if (!target) return { error: c.json({ error: 'No such member.' }, 404) };
  if (target.deskOwner) return { error: c.json({ error: 'The owner’s access is not changed from the desk.' }, 409) };
  return { target };
}

adminDeskRoutes.put('/access/:id', requireAdmin, async (c) => {
  const parsed = pagesSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'pages must be a list of page names' }, 400);
  const { target, error } = await targetMember(c);
  if (error) return error;
  const view = await setDeskPages(target.id, cleanPages(parsed.data.pages));
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
  const key = await adminDeskStore().getKey(c.req.param('id'));
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
