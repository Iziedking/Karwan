import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { getMoneyMovement } from '../db/moneyMovements.js';
import { ownRecord } from '../support/ownRecord.js';
import { getProfile } from '../db/profiles.js';
import { getMember, listMembers } from '../db/teamMembers.js';
import { deskPrincipal, requireSupport } from '../middleware/adminAuth.js';
import { requestDesk } from '../middleware/twoPeople.js';
import { isVerified } from '../agents/shortlist.js';
import { levelOf } from '../verification/live.js';
import { asksForSecret } from '../support/caseRules.js';
import { caseStore, type SupportCase } from '../support/cases.js';
import { dealPanel, personPanel, transferPanel, type DealPanel, type TransferPanel } from '../support/recordView.js';
import { getConversation } from '../support/store.js';
import { askedAlert } from '../support/teamAlerts.js';
import { teamRoomStore } from '../support/teamRoom.js';
import { tellTeamChat } from '../telegram/bot.js';
import { notifyUserOfReply } from '../support/notify.js';

/// The support desk's cases (view 78), under /api/admin/support/cases behind
/// the Support page. Every write passes the desk middleware, so each one
/// already leaves an activity row with the teammate's name.
export const supportDeskRoutes = new Hono();

supportDeskRoutes.use('*', requireSupport);

const text = z.object({ text: z.string().trim().min(1).max(4000) });
const stateBody = z.object({ state: z.enum(['new', 'waiting_us', 'waiting_person', 'solved']) });
const memberBody = z.object({ memberId: z.string().min(1).max(100) });
const askBody = memberBody.extend({ text: z.string().trim().min(1).max(1000) });
const recordBody = z.object({ kind: z.enum(['deal', 'transfer']), id: z.string().min(4).max(100) });
const linkBody = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const fixBody = z.object({ requestId: z.string().min(1).max(100) });

async function body<T>(c: Context, schema: z.ZodType<T>): Promise<T | null> {
  try {
    return schema.parse(await c.req.json());
  } catch {
    return null;
  }
}

async function caseOf(c: Context): Promise<SupportCase | null> {
  return caseStore().get(c.req.param('ref') ?? '');
}

const memberOf = (c: Context) => deskPrincipal(c)?.memberId ?? undefined;

async function nameOf(address: string): Promise<{ name: string; handle: string | null }> {
  const p = await getProfile(address).catch(() => null);
  return { name: p?.displayName?.trim() || 'Not named yet', handle: p?.handle ?? null };
}

async function verifiedOf(address: string): Promise<boolean> {
  return isVerified(await levelOf(address).catch(() => 'unverified' as never));
}

async function panels(c: SupportCase): Promise<Array<DealPanel | TransferPanel>> {
  if (!c.address) return [];
  const viewer = c.address;
  const out: Array<DealPanel | TransferPanel> = [];
  for (const r of c.records) {
    if (r.kind === 'deal') {
      const d = await getDeal(r.id);
      if (!d) continue;
      const other = d.buyer.toLowerCase() === viewer ? d.seller.toLowerCase() : d.buyer.toLowerCase();
      out.push(dealPanel(d, { viewer, names: { [other]: await nameOf(other) } }));
    } else {
      const m = await getMoneyMovement(r.id);
      if (m) out.push(transferPanel(m, { viewer }));
    }
  }
  return out;
}

/// Teammates by name only, so a support member can assign or ask without
/// the owner-only team list. Registered before /:ref.
supportDeskRoutes.get('/team', async (c) => {
  const team = (await listMembers()).filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }));
  return c.json({ team, me: memberOf(c) ?? null });
});

supportDeskRoutes.get('/', async (c) => {
  const asked = c.req.query('asked');
  const state = stateBody.shape.state.safeParse(c.req.query('state'));
  const list = await caseStore().queue({
    ...(state.success ? { state: state.data } : {}),
    ...(asked === 'me' ? { asked: memberOf(c) ?? '-' } : {}),
  });
  const cases = await Promise.all(
    list.map(async (k) => ({
      ref: k.ref,
      kind: k.kind,
      state: k.state,
      person: k.address ? await nameOf(k.address) : null,
      email: k.address ? null : k.email ?? null,
      lastChannel: k.lastChannel,
      dueAt: k.dueAt,
      firstRepliedAt: k.firstRepliedAt ?? null,
      assignee: k.assignee ?? null,
      asked: k.asked ?? null,
      updatedAt: k.updatedAt,
    })),
  );
  return c.json({ cases });
});

supportDeskRoutes.get('/:ref', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const person = k.address
    ? personPanel({
        profile: await getProfile(k.address).catch(() => null),
        verified: await verifiedOf(k.address),
        network: config.ARC_NETWORK,
        earlierCases: (await caseStore().forPerson(k.address)).filter((x) => x.id !== k.id),
      })
    : null;
  return c.json({
    case: k,
    messages: await caseStore().messages(k.id, { forPerson: false }),
    person,
    records: await panels(k),
  });
});

supportDeskRoutes.post('/:ref/reply', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, text);
  if (!b) return c.json({ error: 'Write a reply.' }, 400);
  const memberId = memberOf(c);
  if (asksForSecret(b.text)) {
    const reason = 'It asks for a code or a number Karwan never asks for.';
    await caseStore().add(k.id, { role: 'teammate', channel: 'desk', text: b.text, heldReason: reason, at: Date.now(), ...(memberId ? { memberId } : {}) });
    return c.json({ error: `Not sent. ${reason} Rewrite it.`, code: 'REPLY_HELD', reason }, 422);
  }
  const m = await caseStore().add(k.id, { role: 'teammate', channel: 'desk', text: b.text, at: Date.now(), ...(memberId ? { memberId } : {}) });
  const convo = await getConversation(k.ref);
  if (convo) void notifyUserOfReply(convo, b.text, { messageId: m.id });
  return c.json({ ok: true });
});

supportDeskRoutes.post('/:ref/note', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, text);
  if (!b) return c.json({ error: 'Write a note.' }, 400);
  const memberId = memberOf(c);
  await caseStore().add(k.id, { role: 'note', channel: 'desk', text: b.text, at: Date.now(), ...(memberId ? { memberId } : {}) });
  return c.json({ ok: true });
});

supportDeskRoutes.post('/:ref/state', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, stateBody);
  if (!b) return c.json({ error: 'Pick a state.' }, 400);
  await caseStore().update(k.id, { state: b.state, solvedAt: b.state === 'solved' ? Date.now() : undefined });
  return c.json({ ok: true });
});

supportDeskRoutes.post('/:ref/assign', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, memberBody);
  if (!b || !(await getMember(b.memberId))) return c.json({ error: 'Pick a teammate.' }, 400);
  await caseStore().update(k.id, { assignee: b.memberId });
  return c.json({ ok: true });
});

supportDeskRoutes.post('/:ref/ask', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, askBody);
  const member = b ? await getMember(b.memberId) : null;
  if (!b || !member) return c.json({ error: 'Pick a teammate.' }, 400);
  const by = memberOf(c);
  const asker = by ? (await getMember(by))?.name ?? 'A teammate' : 'A teammate';
  const now = Date.now();
  await caseStore().update(k.id, { asked: member.id });
  await caseStore().add(k.id, { role: 'note', channel: 'desk', text: `Asked ${member.name}: ${b.text}`, at: now, ...(by ? { memberId: by } : {}) });
  await teamRoomStore().post({ caseId: k.id, text: b.text, asks: member.id, at: now, ...(by ? { memberId: by } : {}) });
  void tellTeamChat(askedAlert({ ref: k.ref, asker, asked: member.name, text: b.text })).catch(() => {});
  return c.json({ ok: true });
});

supportDeskRoutes.post('/:ref/records', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, recordBody);
  if (!b) return c.json({ error: 'Name a deal or a transfer.' }, 400);
  if (!k.address || !(await ownRecord(k.address, b))) return c.json({ error: 'That record is not this person\'s.' }, 403);
  if (!k.records.some((r) => r.kind === b.kind && r.id === b.id)) await caseStore().update(k.id, { records: [...k.records, b] });
  return c.json({ ok: true });
});

/// An email case joins an account only when that account has proved the
/// address: its verified email is the case's, or the person has written to
/// the case while signed in.
supportDeskRoutes.post('/:ref/link', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, linkBody);
  if (!b) return c.json({ error: 'Give the account address.' }, 400);
  if (k.contactVerified) return c.json({ error: 'This case is already tied to an account.' }, 409);
  const p = await getProfile(b.address).catch(() => null);
  const emailProved = !!p?.emailVerified && !!p.email && !!k.email && p.email.toLowerCase() === k.email.toLowerCase();
  if (!emailProved && !k.proofAt) {
    return c.json({ error: 'The person has not shown this address is theirs yet.', code: 'PROOF_NEEDED' }, 409);
  }
  await caseStore().update(k.id, { address: b.address.toLowerCase(), contactVerified: true });
  return c.json({ ok: true });
});

/// A money fix is asked for on its own route, which opens a view 64 request;
/// this only ties that request to the case.
supportDeskRoutes.post('/:ref/fixes', async (c) => {
  const k = await caseOf(c);
  if (!k) return c.json({ error: 'case not found' }, 404);
  const b = await body(c, fixBody);
  if (!b) return c.json({ error: 'Name the request.' }, 400);
  const r = await requestDesk().store.get(b.requestId);
  if (!r) return c.json({ error: 'No such request.' }, 404);
  if (r.status !== 'pending' || !r.reason.startsWith(`${k.ref}:`)) {
    return c.json({ error: 'That request is not a pending fix for this case.' }, 409);
  }
  if (!k.fixes.some((f) => f.requestId === r.id)) await caseStore().update(k.id, { fixes: [...k.fixes, { requestId: r.id, action: r.action }] });
  return c.json({ ok: true });
});
