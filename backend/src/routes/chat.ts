import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { getDeal } from '../db/deals.js';
import { listMessages, addMessage } from '../db/messages.js';
import { bus } from '../events.js';
import { localScanProof } from '../security/localScan.js';
import { recordLinkOffense } from '../security/linkOffenses.js';
import { sessionAddress } from '../auth/session.js';
import { logger } from '../logger.js';
import { tradeChannelState } from '../chat/channelAccess.js';
import { validateReplyTarget } from '../chat/replyValidation.js';
import { getMessage } from '../db/messages.js';
import { invalidBodyMessage } from './invalidBody.js';

const addrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const postSchema = z.object({
  // Deprecated: sender identity now comes from the session, not the body. Kept
  // optional so existing clients that still send it don't 400.
  caller: addrSchema.optional(),
  body: z.string().max(2000).optional().default(''),
  replyToId: z.string().min(1).optional(),
  imageDataUrl: z
    .string()
    .max(1_000_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/)
    .optional(),
}).refine((value) => value.body.trim().length > 0 || !!value.imageDataUrl, {
  message: 'add a message or attach an image',
});

export const chatRoutes = new Hono();

/// List messages for one deal. Access is restricted to the two parties of the
/// deal; an unauthorised caller gets 403, not an empty list, so the UI knows.
chatRoutes.get('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  // Chat is private to the two parties, so identity is the signed session, not
  // a client-supplied param. Web3 users get a session via SIWE on connect.
  const caller = sessionAddress(c);
  if (!caller) {
    return c.json({ error: 'sign in to read this chat' }, 401);
  }
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  const state = await tradeChannelState(jobId, caller);
  if (!state.allowed) {
    return c.json({ error: 'only the buyer or seller of this deal can read its chat' }, 403);
  }
  const messages = await listMessages(jobId);
  return c.json({ messages, writable: state.writable, closedAt: state.closedAt, closedReason: state.closedReason });
});

/// Append a message to one deal's chat. Same access rules as the read side.
chatRoutes.post('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = postSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  // Sender identity is the signed session, never the client-supplied
  // body.caller, so a request can't post AS another party by naming their
  // address. Web3 users get a session via SIWE on connect.
  const sender = sessionAddress(c);
  if (!sender) {
    return c.json({ error: 'sign in to post to this chat' }, 401);
  }
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  const state = await tradeChannelState(jobId, sender);
  if (!state.allowed) {
    return c.json({ error: 'only the buyer or seller of this deal can post to its chat' }, 403);
  }
  if (!state.writable) return c.json({ error: 'this conversation is closed', code: 'channel_closed' }, 409);

  const trimmed = body.body.trim();
  if (body.replyToId) {
    const problem = validateReplyTarget(await getMessage(body.replyToId) ?? undefined, jobId, jobId, 'trade');
    if (problem) return c.json({ error: problem, code: 'invalid_reply' }, 400);
  }

  // Security Agent: scan links in the message before it is stored or broadcast.
  // The chat is a second channel a bad actor could use to slip a phishing link
  // past the delivery-proof gate, so a flagged link is blocked outright (never
  // reaches the counterparty) and counts against the sender's reputation.
  if (trimmed) {
    const scan = localScanProof(trimmed);
    if (scan.verdict !== 'clean') {
      recordLinkOffense({
        address: sender,
        jobId,
        surface: 'chat',
        verdict: scan.verdict,
        reasons: scan.reasons,
      });
      logger.warn(
        { jobId, sender, verdict: scan.verdict, reasons: scan.reasons },
        'security: chat message blocked for a flagged link',
      );
      return c.json(
      {
        error:
          'Karwan flagged a link in this message and will not send it. Share work through a normal, verifiable link.',
        code: 'link-blocked',
        verdict: scan.verdict,
        reasons: scan.reasons,
      },
      422,
      );
    }
  }

  const message = {
    id: `${jobId}-${Date.now()}-${randomBytes(4).toString('hex')}`,
    jobId,
    channel: 'trade' as const,
    channelKey: jobId,
    sender,
    kind: 'participant' as const,
    body: trimmed,
    ...(body.imageDataUrl ? { imageDataUrl: body.imageDataUrl } : {}),
    ...(body.replyToId ? { replyToId: body.replyToId } : {}),
    ts: Date.now(),
  };
  await addMessage(message);

  bus.emitEvent({
    type: 'chat.message',
    jobId,
    actor: sender === deal.buyer ? 'buyer' : 'seller',
    payload: {
      messageId: message.id,
      sender: message.sender,
      body: message.body,
      ...(message.imageDataUrl ? { imageDataUrl: message.imageDataUrl } : {}),
      ...(message.replyToId ? { replyToId: message.replyToId } : {}),
      channel: 'trade',
      channelKey: jobId,
      recipient: state.recipient,
      buyer: deal.buyer,
      seller: deal.seller,
    },
  });

  return c.json({ message });
});
