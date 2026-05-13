import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bus, type KarwanEvent } from '../events.js';

export const eventsRoutes = new Hono();

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
