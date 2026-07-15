import { Hono } from 'hono';
import { z } from 'zod';
import { config, conduitApiKeys } from '../config.js';
import { logger } from '../logger.js';
import { KARWAN_ASSISTANT_SYSTEM } from '../assistant/knowledge.js';
import { rateLimit } from '../middleware/rateLimit.js';

/// In-app support assistant. A thin proxy to a Claude model, grounded in the
/// Karwan knowledge base. It answers questions about the product and hands users
/// direct in-app links. It holds no tools and cannot act on an account; it is
/// guidance only.
///
/// Provider chain: the Conduit gateway (Claude Sonnet) is preferred when
/// configured, then the direct Anthropic key, then OpenRouter as the last-resort
/// fallback so a Conduit + Anthropic outage still answers the user. Conduit and
/// Anthropic speak the Anthropic /v1/messages format; OpenRouter speaks the
/// OpenAI chat-completions format, so callProvider builds the request and parses
/// the reply per provider `kind`. A failure on one drops to the next.
export const assistantRoutes = new Hono();

const MAX_OUTPUT_TOKENS = 600;
const MAX_HISTORY = 12;

interface Provider {
  name: string;
  url: string;
  headers: Record<string, string>;
  model: string;
  /// Wire format. 'anthropic' = /v1/messages (Conduit, Anthropic); 'openai' =
  /// chat-completions (OpenRouter). Drives request shape + reply parsing.
  kind: 'anthropic' | 'openai';
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/// The ordered provider chain. Direct Anthropic first (the funded, reliable
/// key), then the Conduit keys as fallbacks, then OpenRouter as the last
/// resort. Empty when nothing is configured (assistant disabled).
export function assistantProviders(): Provider[] {
  const list: Provider[] = [];
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
      kind: 'anthropic',
    });
  }
  // Conduit's Anthropic-compatible endpoint mirrors Anthropic exactly:
  // POST {base}/v1/messages with x-api-key (the sk-cdt-... key) and
  // anthropic-version, same request + response body. (Bearer auth is only the
  // separate OpenAI-compatible /api/v1 route, which we do not use.) Each
  // configured Conduit key is its own fallback provider, tried in order after
  // the direct key, so a rate limit on Anthropic rolls through them before
  // OpenRouter.
  const conduitKeys = conduitApiKeys();
  conduitKeys.forEach((key, i) => {
    list.push({
      name: conduitKeys.length > 1 ? `conduit-${i + 1}` : 'conduit',
      url: `${config.CONDUIT_BASE_URL.replace(/\/$/, '')}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      model: config.CONDUIT_MODEL,
      kind: 'anthropic',
    });
  });
  // OpenRouter last: keeps the assistant answering if BOTH Conduit and Anthropic
  // are down or out of credit. OpenAI-compatible endpoint, so the system prompt
  // rides as the first message (no separate `system` field) and the reply is
  // read from choices[].message.content.
  if (config.OPENROUTER_API_KEY) {
    list.push({
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
      },
      model: config.LLM_MODEL,
      kind: 'openai',
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

/// Read a Claude Messages reply, tolerating BOTH a single JSON body and an
/// Anthropic SSE stream. Conduit returns an event stream ("event: message_start
/// \ndata: {...}") even when stream:false is requested, which would choke
/// res.json(); so detect the stream and collect its text deltas instead.
async function parseClaudeReply(res: Response): Promise<string> {
  const body = await res.text();
  const streamed =
    (res.headers.get('content-type') ?? '').includes('text/event-stream') ||
    body.startsWith('event:') ||
    body.startsWith('data:');
  if (streamed) {
    let out = '';
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
          content_block?: { type?: string; text?: string };
        };
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          out += evt.delta.text ?? '';
        } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'text') {
          out += evt.content_block.text ?? '';
        }
      } catch {
        /* skip keepalives / non-JSON lines */
      }
    }
    return out.trim();
  }
  try {
    const data = JSON.parse(body) as { content?: Array<{ type: string; text?: string }> };
    return (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim();
  } catch {
    return '';
  }
}

/// Read an OpenAI chat-completions reply (OpenRouter). The text sits at
/// choices[0].message.content in a single JSON body.
async function parseOpenAiReply(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  } catch {
    return '';
  }
}

async function callProvider(
  p: Provider,
  messages: ChatMessage[],
  maxTokens: number,
  signal: AbortSignal,
): Promise<ProviderResult> {
  // OpenAI format carries the system prompt as the first message; the Anthropic
  // format carries it in a dedicated `system` field.
  const requestBody =
    p.kind === 'openai'
      ? {
          model: p.model,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: KARWAN_ASSISTANT_SYSTEM }, ...messages],
        }
      : {
          model: p.model,
          max_tokens: maxTokens,
          system: KARWAN_ASSISTANT_SYSTEM,
          messages,
          stream: false,
        };
  const res = await fetch(p.url, {
    method: 'POST',
    headers: p.headers,
    body: JSON.stringify(requestBody),
    signal,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, status: res.status, detail };
  }
  const reply = p.kind === 'openai' ? await parseOpenAiReply(res) : await parseClaudeReply(res);
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

// The assistant serves signed-out visitors too, so it stays session-free, but
// every call is a paid LLM request: without a limit, anonymous volume drives
// the Claude bill directly. 20 messages per 10 minutes per IP is generous for
// a human conversation and ruinous for a script.
assistantRoutes.post(
  '/chat',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, name: 'assistant-chat' }),
  async (c) => {
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
