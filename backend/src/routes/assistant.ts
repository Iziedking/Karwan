import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { KARWAN_ASSISTANT_SYSTEM } from '../assistant/knowledge.js';

/// In-app support assistant. A thin proxy to a Claude model, grounded in the
/// Karwan knowledge base. It answers questions about the product and hands users
/// direct in-app links. It holds no tools and cannot act on an account; it is
/// guidance only.
///
/// Provider chain: the Conduit gateway (Claude Sonnet) is preferred when
/// configured, with the direct Anthropic key as the fallback. Both speak the
/// Anthropic /v1/messages format, so one request shape and one response parser
/// cover both, and a failure on the primary drops to the next.
export const assistantRoutes = new Hono();

const MAX_OUTPUT_TOKENS = 600;
const MAX_HISTORY = 12;

interface Provider {
  name: string;
  url: string;
  headers: Record<string, string>;
  model: string;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/// The ordered provider chain. Conduit first when its key is set, Anthropic as
/// the fallback. Empty when nothing is configured (assistant disabled).
export function assistantProviders(): Provider[] {
  const list: Provider[] = [];
  if (config.CONDUIT_API_KEY) {
    // Conduit's Anthropic-compatible endpoint mirrors Anthropic exactly:
    // POST {base}/v1/messages with x-api-key (the sk-cdt-... key) and
    // anthropic-version, same request + response body. (Bearer auth is only the
    // separate OpenAI-compatible /api/v1 route, which we do not use.)
    list.push({
      name: 'conduit',
      url: `${config.CONDUIT_BASE_URL.replace(/\/$/, '')}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.CONDUIT_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      model: config.CONDUIT_MODEL,
    });
  }
  if (config.ANTHROPIC_API_KEY) {
    list.push({
      name: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      model: config.ASSISTANT_MODEL,
    });
  }
  return list;
}

interface ProviderResult {
  ok: boolean;
  reply?: string;
  status?: number;
  detail?: string;
}

async function callProvider(
  p: Provider,
  messages: ChatMessage[],
  maxTokens: number,
  signal: AbortSignal,
): Promise<ProviderResult> {
  const res = await fetch(p.url, {
    method: 'POST',
    headers: p.headers,
    body: JSON.stringify({
      model: p.model,
      max_tokens: maxTokens,
      system: KARWAN_ASSISTANT_SYSTEM,
      messages,
    }),
    signal,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, status: res.status, detail };
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const reply = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!reply) return { ok: false, detail: 'empty reply' };
  return { ok: true, reply };
}

/// One-shot health ping per provider for the admin diagnostic. Never returns the
/// key, only the provider name, model, status, latency, and a short sample.
export async function pingAssistantProviders(): Promise<
  Array<{
    name: string;
    model: string;
    ok: boolean;
    status?: number;
    detail?: string;
    latencyMs: number;
    sample?: string;
  }>
> {
  const out = [];
  for (const p of assistantProviders()) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const r = await callProvider(p, [{ role: 'user', content: 'ping' }], 16, controller.signal);
      out.push({
        name: p.name,
        model: p.model,
        ok: r.ok,
        status: r.status,
        detail: r.ok ? undefined : r.detail,
        latencyMs: Date.now() - started,
        sample: r.reply?.slice(0, 80),
      });
    } catch (e) {
      out.push({
        name: p.name,
        model: p.model,
        ok: false,
        detail: (e as Error).message,
        latencyMs: Date.now() - started,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  return out;
}

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
  const provs = assistantProviders();
  if (provs.length === 0) {
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

  // Try each provider in order. The first that answers wins; a failure or
  // timeout drops to the next, so a Conduit outage falls back to Anthropic.
  let lastTimeout = false;
  for (const p of provs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const r = await callProvider(p, messages, MAX_OUTPUT_TOKENS, controller.signal);
      if (r.ok && r.reply) return c.json({ reply: r.reply });
      logger.error(
        { provider: p.name, status: r.status, detail: r.detail?.slice(0, 300) },
        'assistant: provider failed, trying next',
      );
    } catch (e) {
      lastTimeout = (e as Error).name === 'AbortError';
      logger.error(
        { provider: p.name, err: (e as Error).message, aborted: lastTimeout },
        'assistant: provider error, trying next',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  return c.json({ error: lastTimeout ? 'assistant-timeout' : 'assistant-error' }, 502);
});
