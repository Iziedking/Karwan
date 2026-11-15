import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AssistantTurnResult } from '../assistant/turn.js';
import type { TurnEvent } from '../assistant/turnEvents.js';
import { logger } from '../logger.js';

/// The chat answers as a stream of what Aman is doing when the page asks for
/// it, and keeps the finished turn for two minutes so a page whose stream
/// broke can fetch it once (view 84). The reply never needs to be saved by the
/// server for this: the page saves it, as before.

const KEEP_MS = 120_000;
const KEEP_MAX = 500;
const kept = new Map<string, { result: AssistantTurnResult; at: number }>();

export function wantsStream(accept: string | undefined): boolean {
  return !!accept && accept.split(',').some((part) => part.trim().toLowerCase().startsWith('text/event-stream'));
}

const keyOf = (address: string, turnId: string) => `${address.toLowerCase()}:${turnId}`;

export function keepFinishedTurn(address: string, turnId: string, result: AssistantTurnResult, now = Date.now()): void {
  kept.delete(keyOf(address, turnId));
  kept.set(keyOf(address, turnId), { result, at: now });
  for (const [key, entry] of kept) {
    if (kept.size <= KEEP_MAX && now - entry.at <= KEEP_MS) break;
    kept.delete(key);
  }
}

export function finishedTurn(address: string, turnId: string, now = Date.now()): AssistantTurnResult | null {
  const entry = kept.get(keyOf(address, turnId));
  if (!entry) return null;
  if (now - entry.at > KEEP_MS) {
    kept.delete(keyOf(address, turnId));
    return null;
  }
  return entry.result;
}

/// The JSON body the chat route has always answered with.
export function turnBody(result: AssistantTurnResult): Record<string, unknown> {
  if (result.ok) return result.actions ? { reply: result.reply, actions: result.actions } : { reply: result.reply };
  return result.code ? { error: result.error, code: result.code } : { error: result.error };
}

export function streamTurn(
  c: Context,
  run: (onStep: (e: TurnEvent) => void) => Promise<AssistantTurnResult>,
  keep: { address: string; turnId?: string },
  opts: { keepAliveMs?: number } = {},
): Response {
  const res = streamSSE(c, async (stream) => {
    const frames: Array<{ event: string; data: string }> = [];
    let wake: (() => void) | null = null;
    const push = (event: string, data: unknown) => {
      frames.push({ event, data: JSON.stringify(data) });
      wake?.();
    };
    let finished = false;
    const turn = run((e) => {
      if (finished) return;
      if (e.kind === 'status') push('status', { tool: e.tool });
      else push('retrying', {});
    })
      .then((result) => {
        if (keep.turnId) keepFinishedTurn(keep.address, keep.turnId, result);
        push(result.ok ? 'done' : 'error', turnBody(result));
      })
      .catch((err: Error) => {
        logger.error({ err: err.message }, 'assistant: streamed turn failed');
        push('error', { error: 'assistant-error' });
      })
      .finally(() => {
        finished = true;
        wake?.();
      });

    const keepAliveMs = opts.keepAliveMs ?? 10_000;
    const ticker = setInterval(() => {
      void stream.write(': keep-alive\n\n');
    }, keepAliveMs);
    try {
      while (true) {
        while (frames.length) {
          const frame = frames.shift()!;
          await stream.writeSSE(frame);
        }
        if (finished) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
      await turn;
    } finally {
      clearInterval(ticker);
    }
  });
  // A proxy that buffers would hold every line until the end.
  res.headers.set('Cache-Control', 'no-cache, no-transform');
  res.headers.set('X-Accel-Buffering', 'no');
  return res;
}
