import { Hono } from 'hono';
import { config } from '../config.js';
import { markProcessed } from '../db/whatsapp.js';
import { logger } from '../logger.js';
import type { InboundMessage } from '../channels/types.js';
import { openChatLink } from './channels.js';
import { webhookHandlers } from '../whatsapp/webhook.js';

let handler: (m: InboundMessage) => Promise<void> = async (m) => {
  logger.warn({ messageId: m.id }, 'whatsapp: message received before a handler was installed');
};

/// The agent installs itself here at startup, so the route module does not
/// import the assistant stack.
export function setInboundHandler(fn: (m: InboundMessage) => Promise<void>): void {
  handler = fn;
}


function createWhatsappRoutes() {
  const { challenge, receive } = webhookHandlers({
    enabled: config.WHATSAPP_ENABLED,
    appSecret: config.WHATSAPP_APP_SECRET,
    verifyToken: config.WHATSAPP_VERIFY_TOKEN,
    markProcessed,
    onMessage: (m) => handler(m),
  });
  const app = new Hono();
  app.get('/webhook', challenge);
  app.post('/webhook', receive);
  // Links already sent from WhatsApp; new links use /api/channels/open.
  app.get('/open', openChatLink);
  return app;
}

export const whatsappRoutes = createWhatsappRoutes();
