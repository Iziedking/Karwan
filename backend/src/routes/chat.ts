import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { getDeal } from '../db/deals.js';
import { listMessages, addMessage } from '../db/messages.js';
import { bus } from '../events.js';

const addrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const postSchema = z.object({
  caller: addrSchema,
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
  const caller = c.req.query('caller');
  if (!caller || !addrSchema.safeParse(caller).success) {
    return c.json({ error: 'caller query param required' }, 400);
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
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  if (!(await callerIsParty(jobId, body.caller))) {
    return c.json({ error: 'only the buyer or seller of this deal can post to its chat' }, 403);
  }

  const trimmed = body.body.trim();
  if (!trimmed) return c.json({ error: 'message body is empty' }, 400);

  const message = {
    id: `${jobId}-${Date.now()}-${randomBytes(4).toString('hex')}`,
    jobId,
    sender: body.caller.toLowerCase(),
    body: trimmed,
    ts: Date.now(),
  };
  await addMessage(message);

  bus.emitEvent({
    type: 'chat.message',
    jobId,
    actor: body.caller.toLowerCase() === deal.buyer ? 'buyer' : 'seller',
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
