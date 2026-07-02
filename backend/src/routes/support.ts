import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { viewerAddress } from '../auth/session.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { rateLimit } from '../middleware/rateLimit.js';
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

// Each /start fires an operator Telegram message plus a team email, so an
// unlimited anonymous endpoint is a spam cannon aimed at ourselves. Three
// fresh tickets per half hour per IP covers any real user.
supportRoutes.post(
  '/start',
  rateLimit({ windowMs: 30 * 60 * 1000, max: 3, name: 'support-start' }),
  async (c) => {
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

supportRoutes.post(
  '/:id/message',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, name: 'support-message' }),
  async (c) => {
  // With the rate-limit middleware in the chain, Hono no longer infers the
  // param type from the path literal; coalesce so the store lookup stays a
  // plain string (an empty id simply resolves to not-open).
  const id = c.req.param('id') ?? '';
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

supportRoutes.post('/:id/close', (c) => {
  const id = c.req.param('id');
  const convo = closeConversation(id);
  if (!convo) return c.json({ error: 'not-found' }, 404);
  // The user ending their chat does NOT email a transcript. The archive
  // transcript is sent once when the operator closes it (admin/Telegram) or
  // when the sweeper auto-closes an abandoned ticket, so it never doubles up.
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

/// Constant-time secret check. A plain !== leaks equality timing, and the
/// secret should ride a header (URLs land in access logs and proxy history);
/// the path variant stays accepted until the email provider webhook is
/// repointed, then it can be dropped.
function inboundSecretOk(supplied: string | undefined): boolean {
  const expected = config.INBOUND_EMAIL_SECRET;
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

supportRoutes.post('/inbound/:secret', async (c) => {
  const supplied = c.req.header('x-inbound-secret') ?? c.req.param('secret');
  if (!inboundSecretOk(supplied)) {
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
