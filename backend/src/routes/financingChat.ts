import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import { financingChannelState } from '../chat/channelAccess.js';
import { addMessage, getMessage, listMessages } from '../db/messages.js';
import { validateReplyTarget } from '../chat/replyValidation.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { localScanProof } from '../security/localScan.js';
import { recordLinkOffense } from '../security/linkOffenses.js';

const paramsSchema = z.object({ kind: z.enum(['factoring', 'po']), positionId: z.string().min(1) });
const bodySchema = z.object({ body: z.string().min(1).max(2000), replyToId: z.string().min(1).optional() });
export const financingChatRoutes = new Hono();

financingChatRoutes.get('/:kind/:positionId', async (c) => {
  const caller = sessionAddress(c);
  if (!caller) return c.json({ error: 'sign in to read this chat' }, 401);
  const params = paramsSchema.safeParse(c.req.param());
  if (!params.success) return c.json({ error: 'invalid financing position' }, 400);
  const state = await financingChannelState(params.data.kind, params.data.positionId, caller);
  if (!state.allowed || !state.jobId) return c.json({ error: 'not permitted to access this financing conversation' }, 403);
  const messages = await listMessages(state.jobId, 'financing', params.data.positionId);
  return c.json({ messages, writable: state.writable, closedAt: state.closedAt, closedReason: state.closedReason });
});

financingChatRoutes.post('/:kind/:positionId', async (c) => {
  const caller = sessionAddress(c);
  if (!caller) return c.json({ error: 'sign in to post to this chat' }, 401);
  const params = paramsSchema.safeParse(c.req.param());
  const body = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!params.success || !body.success) return c.json({ error: 'invalid request' }, 400);
  const state = await financingChannelState(params.data.kind, params.data.positionId, caller);
  if (!state.allowed || !state.jobId) return c.json({ error: 'not permitted to access this financing conversation' }, 403);
  if (!state.writable) return c.json({ error: 'this conversation is closed', code: 'channel_closed' }, 409);
  if (body.data.replyToId) {
    const problem = validateReplyTarget(await getMessage(body.data.replyToId) ?? undefined, state.jobId, params.data.positionId);
    if (problem) return c.json({ error: problem, code: 'invalid_reply' }, 400);
  }
  const text = body.data.body.trim();
  const scan = localScanProof(text);
  if (scan.verdict !== 'clean') {
    recordLinkOffense({ address: caller, jobId: state.jobId, surface: 'chat', verdict: scan.verdict, reasons: scan.reasons });
    logger.warn({ jobId: state.jobId, caller, verdict: scan.verdict }, 'security: financing chat message blocked');
    return c.json({ error: 'Karwan flagged a link in this message and will not send it.', code: 'link-blocked', reasons: scan.reasons }, 422);
  }
  const message = await addMessage({ id: `${params.data.positionId}-${Date.now()}-${randomBytes(4).toString('hex')}`, jobId: state.jobId, channel: 'financing', channelKey: params.data.positionId, financingKind: params.data.kind, financingId: params.data.positionId, sender: caller, kind: 'participant', body: text, replyToId: body.data.replyToId, ts: Date.now() });
  bus.emitEvent({ type: 'chat.message', jobId: state.jobId, actor: 'platform', payload: { messageId: message.id, sender: caller, body: text, channel: 'financing', channelKey: params.data.positionId, financingKind: params.data.kind, recipient: state.recipient } });
  return c.json({ message });
});
