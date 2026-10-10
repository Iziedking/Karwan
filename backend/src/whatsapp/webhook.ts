import { Hono, type Context } from 'hono';
import { logger } from '../logger.js';
import { verifyMetaSignature } from './signature.js';
import { parseInbound, type InboundMessage } from './types.js';

export interface WhatsappWebhookDeps {
  enabled: boolean;
  appSecret: string | undefined;
  verifyToken: string | undefined;
  /// True the first time a message id is seen. Meta redelivers webhooks.
  markProcessed: (messageId: string) => Promise<boolean>;
  onMessage: (m: InboundMessage) => Promise<void>;
  /// Runs work after the response. Meta expects a fast 200 and retries
  /// otherwise, so turns never run inside the request.
  defer?: (fn: () => Promise<void>) => void;
}

const later = (fn: () => Promise<void>) => {
  setImmediate(() => void fn());
};

export function webhookHandlers(deps: WhatsappWebhookDeps) {
  const defer = deps.defer ?? later;

  const challenge = (c: Context) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const echo = c.req.query('hub.challenge') ?? '';
    if (mode === 'subscribe' && deps.verifyToken && token === deps.verifyToken) return c.text(echo);
    return c.text('forbidden', 403);
  };

  const receive = async (c: Context) => {
    if (!deps.enabled || !deps.appSecret) return c.text('unavailable', 503);
    const raw = await c.req.text();
    if (!verifyMetaSignature(raw, c.req.header('x-hub-signature-256'), deps.appSecret)) {
      logger.warn('whatsapp: webhook signature rejected');
      return c.text('unauthorized', 401);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.text('ok');
    }
    for (const message of parseInbound(body)) {
      if (!(await deps.markProcessed(message.id))) continue;
      defer(async () => {
        try {
          await deps.onMessage(message);
        } catch (err) {
          logger.error({ err: (err as Error).message, messageId: message.id }, 'whatsapp: message handling failed');
        }
      });
    }
    return c.text('ok');
  };

  return { challenge, receive };
}

export function createWhatsappWebhook(deps: WhatsappWebhookDeps): Hono {
  const app = new Hono();
  const { challenge, receive } = webhookHandlers(deps);
  app.get('/webhook', challenge);
  app.post('/webhook', receive);
  return app;
}
