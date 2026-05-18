import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bus, type KarwanEvent } from '../events.js';

export const eventsRoutes = new Hono();

/// One-shot JSON snapshot of recent events from the in-memory history. Use
/// this from curl/jq during testing — the root `/api/events` is an SSE
/// stream that never closes, which is hostile to `curl ... | jq`.
eventsRoutes.get('/recent', (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(500, Math.max(1, Number(limitParam ?? 100) || 100));
  const jobId = c.req.query('jobId') ?? undefined;
  const type = c.req.query('type') ?? undefined;
  let events = bus.recent(limit, jobId);
  if (type) {
    const types = new Set(type.split(',').map((s) => s.trim()).filter(Boolean));
    events = events.filter((e) => types.has(e.type));
  }
  return c.json({ events });
});

eventsRoutes.get('/', (c) =>
  streamSSE(c, async (stream) => {
    let id = 0;
    const queue: KarwanEvent[] = [];
    let resolveWait: (() => void) | null = null;

    const unsub = bus.subscribe((e) => {
      queue.push(e);
      resolveWait?.();
      resolveWait = null;
    });

    await stream.writeSSE({ event: 'open', data: JSON.stringify({ ok: true }) });

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolveWait = r;
            setTimeout(r, 15_000);
          });
        }
        while (queue.length > 0) {
          const e = queue.shift()!;
          id += 1;
          await stream.writeSSE({
            id: String(id),
            event: e.type,
            data: JSON.stringify(e),
          });
        }
        await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
      }
    } finally {
      unsub();
    }
  }),
);
