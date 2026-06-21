import { Hono } from 'hono';
import { z } from 'zod';
import { viewerAddress } from '../auth/session.js';
import { logger } from '../logger.js';
import {
  appendUserMessage,
  closeConversation,
  createConversation,
  getConversation,
  messagesSince,
  sweep,
} from '../support/store.js';
import {
  relaySupportUserMessage,
  sendSupportRequestToOperator,
  supportHandoffEnabled,
} from '../telegram/bot.js';
import { sendSupportTranscriptEmail } from '../emails/supportTranscript.js';

/// Live-support handoff. The assistant widget calls /start to escalate from the
/// AI to a human; the operator answers over Telegram (see telegram/bot.ts) and
/// the widget polls /:id/messages for the replies. Closing emails the
/// transcript as the durable archive, so no Postgres table grows here.
export const supportRoutes = new Hono();

const startSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(40)
    .default([]),
  email: z.string().email().max(200).optional(),
});

const messageSchema = z.object({ text: z.string().min(1).max(4000) });

/// Whether the human-handoff button should show at all. The widget hides it
/// when no operator channel is configured.
supportRoutes.get('/status', (c) => c.json({ enabled: supportHandoffEnabled() }));

supportRoutes.post('/start', async (c) => {
  if (!supportHandoffEnabled()) return c.json({ error: 'support-unavailable' }, 503);
  let body;
  try {
    body = startSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const address = viewerAddress(c) ?? undefined;
  const convo = createConversation({ address, email: body.email, transcript: body.messages });
  try {
    await sendSupportRequestToOperator(convo);
  } catch (err) {
    logger.warn({ err: (err as Error).message, id: convo.id }, 'support: operator notify failed');
  }
  // `at` anchors the widget's poll cursor: it only pulls messages newer than
  // the seeded transcript, so the handoff doesn't echo the AI history back.
  return c.json({ conversationId: convo.id, at: convo.updatedAt });
});

supportRoutes.post('/:id/message', async (c) => {
  const id = c.req.param('id');
  let body;
  try {
    body = messageSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const convo = appendUserMessage(id, body.text);
  if (!convo) return c.json({ error: 'not-open' }, 404);
  try {
    await relaySupportUserMessage(convo, body.text);
  } catch (err) {
    logger.warn({ err: (err as Error).message, id }, 'support: relay failed');
  }
  return c.json({ ok: true });
});

supportRoutes.get('/:id/messages', (c) => {
  const id = c.req.param('id');
  const convo = getConversation(id);
  if (!convo) return c.json({ error: 'not-found' }, 404);
  const since = Number(c.req.query('since') ?? 0) || 0;
  return c.json({ status: convo.status, messages: messagesSince(id, since) });
});

supportRoutes.post('/:id/close', async (c) => {
  const id = c.req.param('id');
  const convo = closeConversation(id);
  if (!convo) return c.json({ error: 'not-found' }, 404);
  void sendSupportTranscriptEmail(convo);
  return c.json({ ok: true });
});

/// Slow housekeeping: drop expired closed conversations and auto-close abandoned
/// open ones (archiving them on the way out). Hourly is plenty; this touches
/// only the in-memory map plus a flat-file write.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export function startSupportSweeper(): () => void {
  const timer = setInterval(() => {
    try {
      const autoClosed = sweep();
      for (const convo of autoClosed) void sendSupportTranscriptEmail(convo);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'support sweep failed');
    }
  }, SWEEP_INTERVAL_MS);
  return () => clearInterval(timer);
}
