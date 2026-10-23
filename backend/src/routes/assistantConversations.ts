import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type {
  AssistantConversation,
  ConversationSummary,
  IncomingMessage,
} from '../db/assistantConversations.js';

/// Assistant conversations saved to the account (view 19), session-scoped.
/// Another account's conversation answers exactly like a missing one.

export interface ConversationRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  list: (address: string) => Promise<ConversationSummary[]>;
  get: (address: string, id: string) => Promise<AssistantConversation | null>;
  append: (address: string, id: string | null, messages: readonly IncomingMessage[]) => Promise<AssistantConversation>;
  remove: (address: string, id: string) => Promise<boolean>;
  /// Live turns for this conversation, built fresh on every read and never
  /// stored: a pay card for each deal made here that the seller has accepted
  /// and that is not paid yet (view 24).
  pending?: (address: string, id: string) => Promise<Array<{ role: 'assistant'; content: string; actions: unknown[] }>>;
}

/// The store keeps the last 40 of a conversation; one post never carries more.
const MAX_MESSAGES = 40;

const bodySchema = z.object({
  id: z.string().min(1).max(64).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8_000),
        actions: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
});

const notFound = (c: Context) => c.json({ error: 'not found' }, 404);

export function createAssistantConversationRoutes(deps: ConversationRouteDeps): Hono {
  const app = new Hono();

  async function who(c: Context) {
    return (await deps.sessionAddress(c))?.toLowerCase() ?? null;
  }

  app.get('/', async (c) => {
    const address = await who(c);
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    return c.json({ conversations: await deps.list(address) });
  });

  app.get('/:id', async (c) => {
    const address = await who(c);
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const conversation = await deps.get(address, c.req.param('id'));
    if (!conversation) return notFound(c);
    const live = deps.pending ? await deps.pending(address, conversation.id).catch(() => []) : [];
    return c.json({ conversation: live.length ? { ...conversation, messages: [...conversation.messages, ...live] } : conversation });
  });

  app.post('/', async (c) => {
    const address = await who(c);
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid conversation' }, 400);
    try {
      return c.json({ conversation: await deps.append(address, parsed.data.id ?? null, parsed.data.messages) });
    } catch (e) {
      if (e instanceof Error && e.message === 'not_found') return notFound(c);
      throw e;
    }
  });

  app.delete('/:id', async (c) => {
    const address = await who(c);
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    return (await deps.remove(address, c.req.param('id'))) ? c.json({ ok: true }) : notFound(c);
  });

  return app;
}

/// Mounted at /api/assistant/conversations. The session and store load on
/// first use, so importing this file never opens the database.
const session = () => import('../auth/session.js');
const store = () => import('../db/assistantConversations.js');
export const assistantConversationRoutes = createAssistantConversationRoutes({
  sessionAddress: async (c) => (await session()).sessionAddress(c),
  list: async (address) => (await store()).listConversations(address),
  get: async (address, id) => (await store()).getConversation(address, id),
  append: async (address, id, messages) => (await store()).appendToConversation(address, id, messages),
  remove: async (address, id) => (await store()).deleteConversation(address, id),
  pending: async (address, id) => (await import('../assistant/conversationPayCards.js')).payCardsForConversation(address, id),
});
