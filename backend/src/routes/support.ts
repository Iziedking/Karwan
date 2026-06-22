import { Hono } from 'hono';
import { z } from 'zod';
import { viewerAddress } from '../auth/session.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import {
  appendUserMessage,
  closeConversation,
  createConversation,
  createEmailConversation,
  getConversation,
  messagesSince,
  sweep,
} from '../support/store.js';
import {
  relaySupportUserMessage,
  sendSupportRequestToOperator,
  supportHandoffEnabled,
} from '../telegram/bot.js';
import { sendSupportTranscriptEmail, sendSupportAlertEmail } from '../emails/supportTranscript.js';

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
  // Team email alert so the support group can pick up the ticket immediately,
  // not just on close. Fire-and-forget; Telegram + admin page are the other
  // two channels.
  void sendSupportAlertEmail(convo);
  // `at` anchors the widget's poll cursor: it only pulls messages newer than
  // the seeded transcript, so the handoff doesn't echo the AI history back.
  // conversationId IS the ticket id (KSUP-…), shown to the user for tracing.
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

/// Inbound email -> ticket. The mail provider (Resend Inbound, or a Cloudflare
/// Email Worker) POSTs a received email here. The secret in the path gates it.
/// A reply to one of our emails carries "Ticket KSUP-…" in the subject and
/// re-threads into that conversation; anything else opens a new email ticket.
function parseEmailAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  const addr = (m?.[1] ?? raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : '';
}

supportRoutes.post('/inbound/:secret', async (c) => {
  if (!config.INBOUND_EMAIL_SECRET || c.req.param('secret') !== config.INBOUND_EMAIL_SECRET) {
    return c.json({ error: 'not found' }, 404);
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }
  // Accept Resend's { type, data:{...} } envelope or a normalized {from,subject,text}.
  const data = ((payload.data as Record<string, unknown>) ?? payload) as Record<string, unknown>;
  const fromRaw =
    typeof data.from === 'string'
      ? data.from
      : ((data.from as Record<string, string> | undefined)?.address ??
        (data.from as Record<string, string> | undefined)?.email ??
        '');
  const email = parseEmailAddress(String(fromRaw));
  const subject = String(data.subject ?? '').slice(0, 200);
  const text = String(data.text ?? data.plain ?? '').trim();
  if (!email || !text) return c.json({ error: 'missing from/text' }, 400);

  const tagged = subject.match(/(KSUP-[0-9a-f]+)/i);
  if (tagged) {
    const existing = appendUserMessage(tagged[1]!, text);
    if (existing) {
      try {
        await relaySupportUserMessage(existing, text);
      } catch {
        /* telegram relay best-effort */
      }
      logger.info({ id: existing.id, email }, 'inbound email threaded into ticket');
      return c.json({ ok: true, ticketId: existing.id, threaded: true });
    }
  }

  const convo = createEmailConversation({ email, subject, text });
  try {
    await sendSupportRequestToOperator(convo);
  } catch {
    /* telegram best-effort */
  }
  void sendSupportAlertEmail(convo);
  logger.info({ id: convo.id, email }, 'inbound email opened a new ticket');
  return c.json({ ok: true, ticketId: convo.id, threaded: false });
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
