import type { Context, Next } from 'hono';
import { logger } from '../logger.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/// Clients can send their own X-Forwarded-For and proxies APPEND to it, so the
/// first hop is attacker-controlled: trusting it made every limit spoofable
/// with a fresh header per request. The trustworthy entry is the LAST one,
/// appended by our own edge (Caddy). Falls back to X-Real-IP (Caddy sets it
/// from the socket), then a shared bucket.
function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',');
    return hops[hops.length - 1]!.trim();
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}

/// Fixed-window, in-memory rate limiter keyed by client IP. One store per
/// limiter instance, so call this once per route at registration. Single
/// backend instance today; swap to a shared store (Redis) when we shard.
/// `max` may be read from the request, for a route that allows a signed-in
/// session more than an anonymous caller. While `enabled` returns false every
/// request passes and nothing is counted, so turning it back on resumes the
/// limit as it stood.
export function rateLimit(opts: {
  windowMs: number;
  max: number | ((c: Context) => number);
  name: string;
  enabled?: () => boolean;
  /// Counts by this instead of the network address: a signed-in person or the
  /// email being asked about (view 68). Null falls back to the address.
  key?: (c: Context) => string | null | Promise<string | null>;
}) {
  const store = new Map<string, Bucket>();

  return async (c: Context, next: Next): Promise<Response | void> => {
    if (opts.enabled && !opts.enabled()) {
      await next();
      return;
    }
    const now = Date.now();

    // Opportunistic prune so the map can't grow unbounded across many IPs.
    if (store.size > 5000) {
      for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    }

    const who = opts.key ? await opts.key(c) : null;
    const key = who ? `${opts.name}:k:${who}` : `${opts.name}:${clientIp(c)}`;
    const bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > (typeof opts.max === 'function' ? opts.max(c) : opts.max)) {
        const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
        // Once per window, so a refused action leaves a trace without flooding the log.
        if (bucket.count === (typeof opts.max === 'function' ? opts.max(c) : opts.max) + 1) {
          logger.warn({ limiter: opts.name, retryAfter }, 'rate limit reached');
        }
        c.header('Retry-After', String(retryAfter));
        return c.json(
          { error: 'too many requests, slow down and try again shortly', retryAfterSeconds: retryAfter },
          429,
        );
      }
    }
    await next();
  };
}

/// The email in a JSON body, for a limit counted per email. Hono keeps the
/// parsed body, so the route reads it again as usual.
export async function bodyEmail(c: Context): Promise<string | null> {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
  return typeof body?.email === 'string' && body.email.includes('@') ? body.email.trim().toLowerCase() : null;
}
