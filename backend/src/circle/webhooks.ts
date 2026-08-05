import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { circleWalletsClient } from './wallets.js';
import { logger } from '../logger.js';

/// ECDSA-SHA256 signature verification for Circle webhook notifications.
///
/// Circle signs each webhook with an ECDSA key and names that key in the
/// `X-Circle-Key-Id` header. The public key is fetched BY THAT KEY ID:
///
///   GET /v2/notifications/publicKey/{keyId}
///
/// exposed by the SDK as `getNotificationSignature(id)`. The SDK types that
/// parameter as `subscriptionId`, which is a misleading name: the value lands in
/// the path of a publicKey endpoint, so it must be the key id from the header.
///
/// THIS WAS THE BUG, and it silently broke every deposit. We passed
/// `CIRCLE_WEBHOOK_SUBSCRIPTION_ID`, that endpoint 404'd on it, verification had
/// no key, and every delivery was rejected as an invalid signature. Deposits were
/// therefore never credited and never bridged to Arc, so the money stayed on the
/// source chain while the UI sat on "waiting for your deposit". Nothing in the
/// watcher or the router was wrong; they were never reached.
///
/// A related red herring: `listSubscriptions()` returns zero for this account,
/// because the webhook was created in the Developer Console rather than through
/// the API. That is fine. Verification does not need a subscription to exist.
///
/// Reference: https://developers.circle.com/wallets/webhook-notifications

interface CachedKey {
  id: string;
  algorithm: string;
  key: KeyObject;
  fetchedAt: number;
}

// Keyed BY key id, not a single slot. Circle's docs call the public key static
// for a given id, so this only grows when a key actually rotates. The old single
// slot held whichever key came last and refetched whenever the header differed,
// which is fine with one key and thrashes on every delivery with two in rotation.
// The 24h max age is a safety belt against a rotation we did not notice.
const KEY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const keyCache = new Map<string, CachedKey>();

/// Fetch and cache the public key Circle named in the request.
///
/// `keyId` is the X-Circle-Key-Id header and is REQUIRED: without it there is
/// nothing to look up, and guessing a key would defeat the point of verifying.
async function loadPublicKey(keyId: string | undefined): Promise<CachedKey | null> {
  if (!keyId) {
    logger.warn('circle webhook: no X-Circle-Key-Id header, cannot verify');
    return null;
  }

  const cached = keyCache.get(keyId);
  if (cached && Date.now() - cached.fetchedAt < KEY_MAX_AGE_MS) return cached;

  try {
    const client = circleWalletsClient();
    // Named subscriptionId by the SDK, but it is the path segment of
    // /v2/notifications/publicKey/{keyId}. See the note at the top of this file.
    const res = await client.getNotificationSignature(keyId);
    const data = res.data;
    if (!data?.publicKey || !data.id || !data.algorithm) {
      logger.warn({ keyId }, 'getNotificationSignature returned incomplete data');
      return null;
    }
    const keyObject = createPublicKey({
      key: Buffer.from(data.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const entry: CachedKey = {
      id: data.id,
      algorithm: data.algorithm,
      key: keyObject,
      fetchedAt: Date.now(),
    };
    // Store under the id we asked for AND the id Circle returned. They should
    // match; caching both means a mismatch cannot cause a refetch every delivery.
    keyCache.set(keyId, entry);
    keyCache.set(entry.id, entry);
    logger.info(
      { keyId: entry.id, algorithm: entry.algorithm },
      'circle webhook public key cached',
    );
    return entry;
  } catch (err) {
    logger.warn(
      { keyId, err: (err as Error).message },
      'circle webhook public key fetch failed',
    );
    return null;
  }
}

/// Verify the X-Circle-Signature header against the raw request body bytes.
/// `rawBody` must be the EXACT bytes received over the wire. Never parse and
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
