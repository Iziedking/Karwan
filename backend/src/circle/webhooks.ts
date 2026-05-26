import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { circleWalletsClient } from './wallets.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// ECDSA-SHA256 signature verification for Circle webhook notifications.
///
/// Circle signs each webhook with a per-subscription ECDSA key. The receiver
/// fetches the public key for that subscription (SPKI DER, base64-encoded)
/// from `client.getNotificationSignature(subscriptionId)`, then verifies that
/// the X-Circle-Signature header is the ECDSA-SHA256 signature of the raw
/// request body bytes. The key id in X-Circle-Key-Id changes if Circle rotates
/// the signing key, which is why we cache the fetched key by its id and refetch
/// when the header doesn't match.
///
/// Reference: https://developers.circle.com/wallets/webhook-notifications

interface CachedKey {
  id: string;
  algorithm: string;
  key: KeyObject;
  fetchedAt: number;
}

// One signing key per subscription. We keep the most recent one we fetched;
// when X-Circle-Key-Id doesn't match, we refetch. The 24h max age is a safety
// belt against silent rotation we missed; Circle rotates keys infrequently in
// practice but we should still be resilient.
const KEY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let cachedKey: CachedKey | null = null;

/// Wraps Circle's REST `getNotificationSignature(subscriptionId)` SDK call,
/// decodes the SPKI DER public key, and caches it. Subsequent calls reuse the
/// cached key when X-Circle-Key-Id matches; on mismatch they force-refetch.
async function loadPublicKey(expectedKeyId: string | undefined): Promise<CachedKey | null> {
  const subscriptionId = config.CIRCLE_WEBHOOK_SUBSCRIPTION_ID;
  if (!subscriptionId) return null;

  const fresh =
    cachedKey &&
    Date.now() - cachedKey.fetchedAt < KEY_MAX_AGE_MS &&
    (!expectedKeyId || cachedKey.id === expectedKeyId);
  if (fresh) return cachedKey;

  try {
    const client = circleWalletsClient();
    const res = await client.getNotificationSignature(subscriptionId);
    const data = res.data;
    if (!data?.publicKey || !data.id || !data.algorithm) {
      logger.warn({ subscriptionId }, 'getNotificationSignature returned incomplete data');
      return null;
    }
    const keyObject = createPublicKey({
      key: Buffer.from(data.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    cachedKey = {
      id: data.id,
      algorithm: data.algorithm,
      key: keyObject,
      fetchedAt: Date.now(),
    };
    logger.info(
      { keyId: cachedKey.id, algorithm: cachedKey.algorithm },
      'circle webhook public key cached',
    );
    return cachedKey;
  } catch (err) {
    logger.warn(
      { subscriptionId, err: (err as Error).message },
      'circle webhook public key fetch failed',
    );
    return null;
  }
}

/// Verify the X-Circle-Signature header against the raw request body bytes.
/// `rawBody` must be the EXACT bytes received over the wire — never parse and
/// re-stringify; field-ordering or whitespace differences will invalidate the
/// signature. Returns `false` on any verification failure (missing config,
/// unknown key id after refetch, algorithm we don't support, or bad signature).
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  keyIdHeader: string | undefined,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const cached = await loadPublicKey(keyIdHeader);
  if (!cached) return false;
  // Circle currently signs with ECDSA_SHA_256; reject other algorithms loudly
  // rather than silently downgrading to SHA-256 anyway.
  if (cached.algorithm !== 'ECDSA_SHA_256') {
    logger.warn(
      { algorithm: cached.algorithm },
      'circle webhook: unsupported signature algorithm',
    );
    return false;
  }
  try {
    return verify(
      'sha256',
      Buffer.from(rawBody, 'utf8'),
      cached.key,
      Buffer.from(signatureHeader, 'base64'),
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'circle webhook signature verify threw');
    return false;
  }
}

/// In-memory deduplication of webhook deliveries. Circle retries on non-2xx
/// responses, and re-runs after a redeploy can replay the same payload. The
/// `notificationId` in every Circle webhook envelope is the dedupe key. We keep
/// the last 5k IDs; a typical bursty hour is well below that, and old IDs age
/// out naturally as new ones land.
const DEDUPE_CAPACITY = 5000;
const seenNotificationIds: Set<string> = new Set();
const seenOrder: string[] = [];

export function isDuplicateNotification(notificationId: string | undefined): boolean {
  if (!notificationId) return false;
  if (seenNotificationIds.has(notificationId)) return true;
  seenNotificationIds.add(notificationId);
  seenOrder.push(notificationId);
  if (seenOrder.length > DEDUPE_CAPACITY) {
    const drop = seenOrder.shift();
    if (drop) seenNotificationIds.delete(drop);
  }
  return false;
}
