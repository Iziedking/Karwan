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

/// Fail-closed admin gate. Accepts the token via either header convention:
///   X-Admin-Token: <token>
///   Authorization: Bearer <token>
/// Both compare against ADMIN_API_TOKEN. When the token isn't configured, the
/// admin surface is DISABLED (503) rather than left open, so a missing env
/// var can never silently expose admin.
///
/// The Authorization: Bearer form is the standard most CLI users + curl
/// examples reach for; keeping X-Admin-Token for back-compat with anything
/// already wired against the older shape.
function providedToken(c: Context): string {
  const headerToken = c.req.header('x-admin-token') ?? '';
  const authHeader = c.req.header('authorization') ?? '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  return headerToken || bearerToken;
}

/// Which role the caller's token grants: full 'admin', ticket-only 'support',
/// or null when it matches neither. Constant-time compared.
export function tokenRole(c: Context): 'admin' | 'support' | null {
  const provided = providedToken(c);
  if (!provided) return null;
  if (config.ADMIN_API_TOKEN && constantTimeEqual(provided, config.ADMIN_API_TOKEN)) return 'admin';
  if (config.SUPPORT_API_TOKEN && constantTimeEqual(provided, config.SUPPORT_API_TOKEN)) return 'support';
  return null;
}

export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const expected = config.ADMIN_API_TOKEN;
  if (!expected) {
    return c.json({ error: 'admin API disabled (ADMIN_API_TOKEN not set)' }, 503);
  }
  const provided = providedToken(c);
  if (!provided || !constantTimeEqual(provided, expected)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

/// Gate for the support tickets surface: accepts the full admin token OR the
/// support-team token. The admin token can do everything; the support token is
/// scoped to tickets only and is rejected everywhere else (requireAdmin).
export async function requireSupport(c: Context, next: Next): Promise<Response | void> {
  if (!config.ADMIN_API_TOKEN && !config.SUPPORT_API_TOKEN) {
    return c.json({ error: 'admin API disabled' }, 503);
  }
  if (tokenRole(c) === null) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}
