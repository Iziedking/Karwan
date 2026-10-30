import { Hono } from 'hono';
import { z } from 'zod';
import { requireSupport, tokenRole } from '../middleware/adminAuth.js';
import {
  listOpenConversations,
  getConversation,
  appendOperatorMessage,
  closeConversation,
} from '../support/store.js';
import { sendSupportTranscriptEmail } from '../emails/supportTranscript.js';
import { notifyUserOfReply } from '../support/notify.js';

/// Support-team surface, mounted at /api/admin/support. Gated by requireSupport
/// so BOTH the full admin token and the scoped support-team token reach it,
/// while the rest of /api/admin (deals, profiles, management, events) stays
/// admin-only. Support staff can answer tickets without any power to touch
/// deals or accounts.
export const supportTeamRoutes = new Hono();

supportTeamRoutes.use('*', requireSupport);

/// What is waiting for a person at Karwan, without a ticket (view 21): open
/// deals whose match the security agent held, with the offence each hold rests
/// on and the deals it came from, and open deals whose current delivery link
/// is held. Registered before /:id so a ticket id never shadows it.
supportTeamRoutes.get('/held', async (c) => {
  const [{ listAllDeals }, { holdOpenFor }, { getLinkOffense }] = await Promise.all([
    import('../db/deals.js'),
    import('../deals/matchHold.js'),
    import('../security/linkOffenses.js'),
  ]);
  const deals = await listAllDeals();
  const open = deals.filter((d) => !d.settledAt && !d.cancelledAt);
  const matches = open
    .flatMap((deal) => {
      const risk = holdOpenFor(deal);
      return risk ? [{ deal, risk }] : [];
    })
    .sort((a, b) => b.risk.evaluatedAt - a.risk.evaluatedAt)
    .map(({ deal, risk }) => ({
      jobId: deal.jobId,
      buyer: deal.buyer,
      seller: deal.seller,
      amountUsdc: deal.dealAmountUsdc,
      evaluatedAt: risk.evaluatedAt,
      flags: risk.flags,
      reasons: risk.reasons.map((r) => (typeof r === 'string' ? { text: r, audience: 'both' as const } : r)),
      offences: [deal.buyer, deal.seller].flatMap((address) => {
        const o = getLinkOffense(address);
        return o ? [{ address: o.address, count: o.count, lastVerdict: o.lastVerdict, from: o.from }] : [];
      }),
    }));
  const links = open
    .filter((d) => d.delivered && (d.verificationStatus === 'suspicious' || d.verificationStatus === 'malicious'))
    .sort((a, b) => (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0))
    .map((d) => ({ jobId: d.jobId, buyer: d.buyer, seller: d.seller, amountUsdc: d.dealAmountUsdc, deliveryRevision: d.deliveryRevision ?? 0, verificationStatus: d.verificationStatus, deliveredAt: d.deliveredAt ?? null }));
  return c.json({ matches, links });
});

const clearSchema = z.object({ reason: z.string().min(1).max(1000) });

/// A person clears a held match with a reason. The hold moved no money, so one
/// credential is enough; the record keeps the role, the time and the reason.
supportTeamRoutes.post('/matches/:jobId/clear', async (c) => {
  const role = tokenRole(c);
  if (!role) return c.json({ error: 'unauthorized' }, 401);
  const parsed = clearSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'a reason is required' }, 400);
  const { applyMatchHoldClear, liveMatchHoldDeps } = await import('../deals/matchHoldService.js');
  const out = await applyMatchHoldClear(c.req.param('jobId'), { role, reason: parsed.data.reason }, await liveMatchHoldDeps());
  if (!out.ok) {
    const status = out.code === 'not-found' ? 404 : out.code === 'reason-required' ? 400 : 409;
    return c.json({ error: out.message, code: out.code }, status);
  }
  const { logger } = await import('../logger.js');
  logger.info({ jobId: c.req.param('jobId'), role, flags: out.matchRisk.flags }, 'support: match hold cleared');
  const { clearReason: _reason, ...matchRisk } = out.matchRisk;
  return c.json({ matchRisk, cleared: true });
});

/// A delivery the link check holds, as the reviewer needs it: the link as
/// text (never a clickable link here; open it in a safe browser), what the
/// scanner saw, and any review already started. ?revision=N reads an earlier
/// delivery, or any delivery of a closed deal, for a record-only review.
/// Registered before /:id so a ticket id never shadows it.
supportTeamRoutes.get('/deliveries/:jobId', async (c) => {
  const { getDeal } = await import('../db/deals.js');
  const { reviewOpenFor, reviewableDeliveries } = await import('../deals/deliveryReview.js');
  const { holdOpenFor } = await import('../deals/matchHold.js');
  const deal = await getDeal(c.req.param('jobId'));
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  const current = deal.deliveryRevision ?? 0;
  const asked = Number(c.req.query('revision'));
  const revision = Number.isInteger(asked) && asked >= 0 ? asked : current;
  const closed = Boolean(deal.settledAt || deal.cancelledAt);
  const entry = revision === current ? null : deal.deliveryHistory?.find((e) => e.revision === revision) ?? null;
  if (revision !== current && !entry) return c.json({ error: 'no delivery with that number' }, 404);
  const hold = holdOpenFor(deal);
  return c.json({
    jobId: deal.jobId,
    buyer: deal.buyer,
    seller: deal.seller,
    amountUsdc: deal.dealAmountUsdc,
    delivered: deal.delivered === true,
    closed,
    deliveryRevision: current,
    revision,
    scope: !closed && revision === current ? 'current' : 'record-only',
    deliveryProof: (entry ? entry.deliveryProof : deal.deliveryProof) ?? null,
    verificationStatus: (entry ? entry.verificationStatus : deal.verificationStatus) ?? null,
    verificationReasons: entry ? [] : deal.verificationReasons ?? [],
    review: reviewOpenFor(deal, revision),
    deliveries: reviewableDeliveries(deal),
    matchHold: hold
      ? { flags: hold.flags, reasons: hold.reasons.map((r) => (typeof r === 'string' ? { text: r, audience: 'both' as const } : r)), evaluatedAt: hold.evaluatedAt }
      : null,
  });
});

const reviewSchema = z.object({
  decision: z.enum(['safe', 'unsafe']),
  reason: z.string().min(1).max(1000),
  revision: z.number().int().min(0).optional(),
});

/// Clear a flagged delivery link or keep it blocked. The credential decides
/// the reviewer role, so a link rated malicious needs both tokens. With a
/// revision, an earlier or closed delivery is reviewed for the record only.
supportTeamRoutes.post('/deliveries/:jobId/review', async (c) => {
  const role = tokenRole(c);
  if (!role) return c.json({ error: 'unauthorized' }, 401);
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'decision must be safe or unsafe, with a reason' }, 400);
  const { applyDeliveryReview, liveDeliveryReviewDeps } = await import('../deals/deliveryReviewService.js');
  const out = await applyDeliveryReview(c.req.param('jobId'), { role, ...parsed.data }, await liveDeliveryReviewDeps());
  if (!out.ok) {
    const status = out.code === 'not-found' || out.code === 'no-such-delivery' ? 404 : out.code === 'reason-required' ? 400 : 409;
    return c.json({ error: out.message, code: out.code }, status);
  }
  const { logger } = await import('../logger.js');
  logger.info({ jobId: c.req.param('jobId'), role, decision: parsed.data.decision, revision: out.review.deliveryRevision, scope: out.scope, outcome: out.review.decision }, 'support: delivery review');
  return c.json({ review: out.review, cleared: out.clears, scope: out.scope });
});

/// Lets the frontend know which token it holds, so a support-only token sees
/// only the tickets nav and never the rest of the admin page.
supportTeamRoutes.get('/whoami', (c) => c.json({ role: tokenRole(c) }));

/// Open support tickets, newest activity first, with a compact preview.
supportTeamRoutes.get('/', (c) => {
  const rows = listOpenConversations().map((convo) => {
    const last = convo.messages[convo.messages.length - 1];
    return {
      id: convo.id,
      address: convo.address ?? null,
      email: convo.email ?? null,
      messageCount: convo.messages.length,
      lastRole: last?.role ?? null,
      lastText: last ? last.text.slice(0, 160) : '',
      createdAt: convo.createdAt,
      updatedAt: convo.updatedAt,
    };
  });
  return c.json({ count: rows.length, tickets: rows });
});

/// Full transcript of one ticket for the reply view.
supportTeamRoutes.get('/:id', (c) => {
  const convo = getConversation(c.req.param('id'));
  if (!convo) return c.json({ error: 'ticket not found' }, 404);
  return c.json({
    id: convo.id,
    address: convo.address ?? null,
    email: convo.email ?? null,
    status: convo.status,
    messages: convo.messages,
    dealIds: convo.dealIds ?? [],
  });
});

const replySchema = z.object({ text: z.string().min(1).max(4000) });
supportTeamRoutes.post('/:id/reply', async (c) => {
  const id = c.req.param('id');
  let body;
  try {
    body = replySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const convo = appendOperatorMessage(id, body.text);
  if (!convo) return c.json({ error: 'ticket not open' }, 404);
  // Reach the user on every channel they have: email, Telegram, and the widget.
  void notifyUserOfReply(convo, body.text);
  return c.json({ ok: true });
});

supportTeamRoutes.post('/:id/close', (c) => {
  const convo = closeConversation(c.req.param('id'));
  if (!convo) return c.json({ error: 'ticket not found' }, 404);
  void sendSupportTranscriptEmail(convo);
  return c.json({ ok: true });
});
