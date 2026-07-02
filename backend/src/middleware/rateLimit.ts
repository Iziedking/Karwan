import type { Context, Next } from 'hono';

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
export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const store = new Map<string, Bucket>();

  return async (c: Context, next: Next): Promise<Response | void> => {
    const now = Date.now();

    // Opportunistic prune so the map can't grow unbounded across many IPs.
    if (store.size > 5000) {
      for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    }

    const key = `${opts.name}:${clientIp(c)}`;
    const bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > opts.max) {
        const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
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
