import { Writable } from 'node:stream';

/// Alchemy, QuikNode and the Canteen node put the API key in the URL path or
/// query, and viem prints the full URL in every HTTP error. These helpers cut a
/// configured RPC URL down to scheme and host wherever it appears.

const RPC_ENV = /(RPC|WSS)_URLS?$/;

function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/// Every RPC or websocket URL in the environment that carries more than a host.
/// A bare host hides nothing, so it is left alone.
export function rpcSecretUrls(env: Record<string, string | undefined>): string[] {
  const out = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || !RPC_ENV.test(name)) continue;
    for (const raw of value.split(',')) {
      const url = raw.trim();
      const origin = originOf(url);
      if (!origin) continue;
      const bare = url.replace(/\/+$/, '');
      if (bare === origin) continue;
      out.add(url);
      if (bare !== url) out.add(bare);
    }
  }
  // Longest first, so a URL is never half-replaced by a shorter one it contains.
  return [...out].sort((a, b) => b.length - a.length);
}

export function redactRpcUrls(text: string, urls: readonly string[]): string {
  let out = text;
  for (const url of urls) {
    if (!out.includes(url)) continue;
    out = out.split(url).join(originOf(url) ?? 'rpc-url');
  }
  return out;
}

/// Scrubs the error in place, cause chain included, and returns the same
/// object: callers match on viem's error types, so it must never be replaced.
export function redactErrorUrls<T>(err: T, urls: readonly string[]): T {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === 'object' && !seen.has(cur) && seen.size < 8) {
    seen.add(cur);
    const e = cur as Record<string, unknown>;
    for (const field of ['message', 'shortMessage', 'details', 'url', 'stack']) {
      const v = e[field];
      if (typeof v !== 'string') continue;
      const clean = redactRpcUrls(v, urls);
      if (clean === v) continue;
      try {
        e[field] = clean;
      } catch {
        // A getter-only field stays as it is; the log stream still scrubs it.
      }
    }
    cur = e.cause;
  }
  return err;
}

/// A pass-through for log lines: anything written lands in `dest` with every
/// configured RPC URL cut to its host.
export function redactingStream(dest: Writable, urls: readonly string[]): Writable {
  return new Writable({
    write(chunk, _enc, done) {
      dest.write(redactRpcUrls(String(chunk), urls), done);
    },
  });
}
