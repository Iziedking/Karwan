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

/// A delivery the link check holds, as the reviewer needs it: the link as
/// text (never a clickable link here; open it in a safe browser), what the
/// scanner saw, and any review already started. Registered before /:id so a
/// ticket id never shadows it.
supportTeamRoutes.get('/deliveries/:jobId', async (c) => {
  const { getDeal } = await import('../db/deals.js');
  const { reviewOpenFor } = await import('../deals/deliveryReview.js');
  const deal = await getDeal(c.req.param('jobId'));
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  return c.json({
    jobId: deal.jobId,
    buyer: deal.buyer,
    seller: deal.seller,
    amountUsdc: deal.dealAmountUsdc,
    delivered: deal.delivered === true,
    closed: Boolean(deal.settledAt || deal.cancelledAt),
    deliveryRevision: deal.deliveryRevision ?? 0,
    deliveryProof: deal.deliveryProof ?? null,
    verificationStatus: deal.verificationStatus ?? null,
    verificationReasons: deal.verificationReasons ?? [],
    review: reviewOpenFor(deal),
  });
});

const reviewSchema = z.object({ decision: z.enum(['safe', 'unsafe']), reason: z.string().min(1).max(1000) });

/// Clear a flagged delivery link or keep it blocked. The credential decides
/// the reviewer role, so a link rated malicious needs both tokens.
supportTeamRoutes.post('/deliveries/:jobId/review', async (c) => {
  const role = tokenRole(c);
  if (!role) return c.json({ error: 'unauthorized' }, 401);
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'decision must be safe or unsafe, with a reason' }, 400);
  const { applyDeliveryReview, liveDeliveryReviewDeps } = await import('../deals/deliveryReviewService.js');
  const out = await applyDeliveryReview(c.req.param('jobId'), { role, ...parsed.data }, await liveDeliveryReviewDeps());
  if (!out.ok) {
    const status = out.code === 'not-found' ? 404 : out.code === 'reason-required' ? 400 : 409;
    return c.json({ error: out.message, code: out.code }, status);
  }
  const { logger } = await import('../logger.js');
  logger.info({ jobId: c.req.param('jobId'), role, decision: parsed.data.decision, outcome: out.review.decision }, 'support: delivery review');
  return c.json({ review: out.review, cleared: out.clears });
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
