import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { KARWAN_ASSISTANT_SYSTEM } from '../assistant/knowledge.js';

/// In-app support assistant. A thin proxy to Anthropic on a low-cost model,
/// grounded in the Karwan knowledge base. It answers questions about the
/// product and hands users direct in-app links. It holds no tools and cannot
/// act on an account; it is guidance only.
export const assistantRoutes = new Hono();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
/// Keep replies short and the context bounded: this is a support chat, not a
/// long-form generator, and it caps cost on a per-message basis.
const MAX_OUTPUT_TOKENS = 600;
const MAX_HISTORY = 12;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

assistantRoutes.post('/chat', async (c) => {
  if (!config.ANTHROPIC_API_KEY) {
    return c.json({ error: 'assistant-unavailable' }, 503);
  }

  let body;
  try {
    body = bodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  // Only the tail of the conversation goes to the model, and the last turn must
  // be the user's. Trimming a trailing assistant turn keeps the call valid.
  let messages = body.messages.slice(-MAX_HISTORY);
  while (messages.length && messages[messages.length - 1]!.role !== 'user') {
    messages = messages.slice(0, -1);
  }
  if (messages.length === 0) {
    return c.json({ error: 'no user message' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.ASSISTANT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: KARWAN_ASSISTANT_SYSTEM,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error({ status: res.status, detail: detail.slice(0, 500) }, 'assistant: anthropic error');
      return c.json({ error: 'assistant-error' }, 502);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const reply = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!reply) {
      logger.error({ data }, 'assistant: empty reply');
      return c.json({ error: 'assistant-error' }, 502);
    }

    return c.json({ reply });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    logger.error({ err: (e as Error).message, aborted }, 'assistant: request failed');
    return c.json({ error: aborted ? 'assistant-timeout' : 'assistant-error' }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
