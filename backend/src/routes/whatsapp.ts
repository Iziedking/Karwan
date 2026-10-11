import { Hono } from 'hono';
import { ARC } from '../chain/client.js';
import { config } from '../config.js';
import { markProcessed } from '../db/whatsapp.js';
import { setSessionCookie } from '../auth/session.js';
import { logger } from '../logger.js';
import { OPEN_LINK_SESSION_SECS, type OpenablePath } from '../whatsapp/openLink.js';
import { openHandler } from '../whatsapp/openRoute.js';
import type { InboundMessage } from '../whatsapp/types.js';
import { webhookHandlers } from '../whatsapp/webhook.js';

let handler: (m: InboundMessage) => Promise<void> = async (m) => {
  logger.warn({ messageId: m.id }, 'whatsapp: message received before a handler was installed');
};
let redeemer: (token: string) => Promise<{ address: string; path: OpenablePath } | null> = async () => null;

/// The agent installs itself here at startup, so the route module does not
/// import the assistant stack.
export function setInboundHandler(fn: (m: InboundMessage) => Promise<void>): void {
  handler = fn;
}

export function setOpenRedeemer(fn: typeof redeemer): void {
  redeemer = fn;
}

const webBase = (config.FRONTEND_BASE_URL ?? (ARC.testnet ? 'https://testnet.karwan.site' : 'https://karwan.site')).replace(/\/$/, '');

function createWhatsappRoutes() {
  const { challenge, receive } = webhookHandlers({
    enabled: config.WHATSAPP_ENABLED,
    appSecret: config.WHATSAPP_APP_SECRET,
    verifyToken: config.WHATSAPP_VERIFY_TOKEN,
    markProcessed,
    onMessage: (m) => handler(m),
  });
  const open = openHandler({
    webBase,
    redeem: (token) => redeemer(token),
    signIn: (c, address) =>
      setSessionCookie(c, { address, method: 'circle', chainId: ARC.chainId }, { ttlSecs: OPEN_LINK_SESSION_SECS }),
  });
  const app = new Hono();
  app.get('/webhook', challenge);
  app.post('/webhook', receive);
  app.get('/open', open);
  return app;
}

export const whatsappRoutes = createWhatsappRoutes();
