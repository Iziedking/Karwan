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
