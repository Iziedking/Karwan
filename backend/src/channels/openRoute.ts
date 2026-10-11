import { Hono, type Context } from 'hono';
import type { OpenablePath } from './openLink.js';

export interface OpenRouteDeps {
  webBase: string;
  redeem: (token: string) => Promise<{ address: string; path: OpenablePath } | null>;
  signIn: (c: Context, address: string) => void;
}

/// GET /open?t=<token>: the one-time link a chat account gets for the few
/// steps that need a page. A used or expired link signs nobody in.
export function openHandler(deps: OpenRouteDeps) {
  return async (c: Context) => {
    c.header('Cache-Control', 'no-store');
    const token = c.req.query('t');
    if (!token) return c.text('missing link', 400);
    const opened = await deps.redeem(token);
    if (!opened) return c.redirect(`${deps.webBase}/?link=expired`, 302);
    deps.signIn(c, opened.address);
    return c.redirect(`${deps.webBase}${opened.path}`, 302);
  };
}

export function createOpenRoute(deps: OpenRouteDeps): Hono {
  const app = new Hono();
  app.get('/open', openHandler(deps));
  return app;
}
