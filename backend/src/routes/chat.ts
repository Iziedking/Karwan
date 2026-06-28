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

const addrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const postSchema = z.object({
  // Deprecated: sender identity now comes from the session, not the body. Kept
  // optional so existing clients that still send it don't 400.
  caller: addrSchema.optional(),
  body: z.string().min(1).max(2000),
});

async function callerIsParty(jobId: string, caller: string): Promise<boolean> {
  const deal = await getDeal(jobId);
  if (!deal) return false;
  const a = caller.toLowerCase();
  return deal.buyer === a || deal.seller === a;
}

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
  if (!(await callerIsParty(jobId, caller))) {
    return c.json({ error: 'only the buyer or seller of this deal can read its chat' }, 403);
  }
  const messages = await listMessages(jobId);
  return c.json({ messages });
});

/// Append a message to one deal's chat. Same access rules as the read side.
chatRoutes.post('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = postSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
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
  if (!(await callerIsParty(jobId, sender))) {
    return c.json({ error: 'only the buyer or seller of this deal can post to its chat' }, 403);
  }

  const trimmed = body.body.trim();
  if (!trimmed) return c.json({ error: 'message body is empty' }, 400);

  // Security Agent: scan links in the message before it is stored or broadcast.
  // The chat is a second channel a bad actor could use to slip a phishing link
  // past the delivery-proof gate, so a flagged link is blocked outright (never
  // reaches the counterparty) and counts against the sender's reputation.
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

  const message = {
    id: `${jobId}-${Date.now()}-${randomBytes(4).toString('hex')}`,
    jobId,
    sender,
    body: trimmed,
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
      buyer: deal.buyer,
      seller: deal.seller,
    },
  });

  return c.json({ message });
});
