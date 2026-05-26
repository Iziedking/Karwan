import { Hono } from 'hono';
import { config } from '../config.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import {
  verifyWebhookSignature,
  isDuplicateNotification,
} from '../circle/webhooks.js';

export const circleWebhookRoutes = new Hono();

/// Connectivity probes. Circle has used HEAD historically; current production
/// behaviour (observed 2026-05-26) probes via POST. Either method gets 200, no
/// body, no information disclosure. Adding a GET handler too so curl-style
/// health checks work without -X HEAD gymnastics.
circleWebhookRoutes.on(['GET', 'HEAD'], '/webhook', (c) =>
  c.json({ ok: true, configured: !!config.CIRCLE_WEBHOOK_SUBSCRIPTION_ID }),
);

/// Reject anything past this age in seconds. Anti-replay; legitimate webhooks
/// arrive within a few seconds. 10 minutes is a generous tolerance for clock
/// skew and intermediate retry queues; tighten on mainnet if needed.
const MAX_NOTIFICATION_AGE_SEC = 10 * 60;

/// POST /api/circle/webhook receives Circle's signed event notifications for
/// the developer-controlled-wallets subscription configured via
/// CIRCLE_WEBHOOK_SUBSCRIPTION_ID. Responds in well under the 5-second budget
/// Circle enforces by emitting a bus event and returning immediately;
/// downstream handlers run on the bus listener loop.
///
/// Defensive ordering (do not reshuffle):
///   1. Read raw body as text (signature is over these bytes verbatim).
///   2. Verify signature against the cached Circle public key.
///   3. Parse JSON only after the signature checks out.
///   4. Dedupe by notificationId so a retried delivery is a no-op.
///   5. Reject events older than MAX_NOTIFICATION_AGE_SEC (anti-replay).
///   6. Emit on the bus and respond 200.
circleWebhookRoutes.post('/webhook', async (c) => {
  if (!config.CIRCLE_WEBHOOK_SUBSCRIPTION_ID) {
    return c.json({ error: 'circle webhook not configured' }, 503);
  }

  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'circle webhook: could not read body');
    return c.json({ error: 'bad body' }, 400);
  }

  const signature = c.req.header('X-Circle-Signature') ?? c.req.header('x-circle-signature');
  const keyId = c.req.header('X-Circle-Key-Id') ?? c.req.header('x-circle-key-id');
  const verified = await verifyWebhookSignature(rawBody, signature, keyId);
  if (!verified) {
    logger.warn({ keyId, hasSignature: !!signature }, 'circle webhook: signature invalid');
    return c.json({ error: 'invalid signature' }, 401);
  }

  let envelope: {
    subscriptionId?: string;
    notificationId?: string;
    notificationType?: string;
    notification?: Record<string, unknown>;
    timestamp?: string;
    version?: number;
  };
  try {
    envelope = JSON.parse(rawBody);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'circle webhook: invalid JSON');
    return c.json({ error: 'invalid json' }, 400);
  }

  if (isDuplicateNotification(envelope.notificationId)) {
    // A retry. Already processed; respond 200 so Circle stops retrying.
    return c.json({ ok: true, dedup: true });
  }

  // Anti-replay window. timestamp is ISO 8601 per Circle's docs example.
  if (envelope.timestamp) {
    const ts = Date.parse(envelope.timestamp);
    if (Number.isFinite(ts)) {
      const ageSec = (Date.now() - ts) / 1000;
      if (ageSec > MAX_NOTIFICATION_AGE_SEC) {
        logger.warn(
          { ageSec, notificationId: envelope.notificationId },
          'circle webhook: stale notification rejected',
        );
        return c.json({ error: 'stale' }, 401);
      }
    }
  }

  logger.info(
    {
      notificationType: envelope.notificationType,
      notificationId: envelope.notificationId,
      subscriptionId: envelope.subscriptionId,
    },
    'circle webhook received',
  );

  // Emit on the bus. Subscribers route on notificationType. The full
  // notification payload is forwarded so e.g. the bridge pipeline can react to
  // transaction state changes for its in-flight approve / burn / mint without
  // waiting for the next poll iteration.
  bus.emitEvent({
    type: 'circle.webhook',
    actor: 'platform',
    payload: {
      notificationType: envelope.notificationType,
      notificationId: envelope.notificationId,
      notification: envelope.notification,
      timestamp: envelope.timestamp,
    },
  });

  return c.json({ ok: true });
});
