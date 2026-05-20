import type { Context, Next } from 'hono';
import { config } from '../config.js';

/// Constant-time string compare. Returns false fast on length mismatch (the
/// token length isn't the secret); equal-length inputs are compared without an
/// early exit so a timing side-channel can't reveal the token byte by byte.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/// Fail-closed admin gate. Requires `X-Admin-Token` to match ADMIN_API_TOKEN.
/// When the token isn't configured, the admin surface is DISABLED (503) rather
/// than left open — so a missing env var can never silently expose admin.
export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const expected = config.ADMIN_API_TOKEN;
  if (!expected) {
    return c.json({ error: 'admin API disabled (ADMIN_API_TOKEN not set)' }, 503);
  }
  const provided = c.req.header('x-admin-token') ?? '';
  if (!constantTimeEqual(provided, expected)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}
