import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db, pgEnabled } from './client.js';
import { circleWebhookNotifications } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'circle-webhook-notifications.json');

interface NotificationStore {
  ids: Record<string, { notificationType?: string; receivedAt: number }>;
}

/**
 * Atomically claim a Circle notification id. `true` means this delivery owns
 * processing; `false` means it was already accepted by this installation.
 * Circle retries and state transitions are normal, so this is deliberately
 * separate from transaction-level dedupe in the reconciler.
 */
export async function claimCircleNotification(input: {
  notificationId: string;
  notificationType?: string;
}): Promise<boolean> {
  const notificationId = input.notificationId.trim();
  if (!notificationId) return false;
  const receivedAt = Date.now();
  if (pgEnabled) {
    const rows = await db()
      .insert(circleWebhookNotifications)
      .values({
        notificationId,
        notificationType: input.notificationType ?? null,
        receivedAt,
      })
      .onConflictDoNothing()
      .returning({ notificationId: circleWebhookNotifications.notificationId });
    return rows.length > 0;
  }

  const store = loadStore();
  if (store.ids[notificationId]) return false;
  store.ids[notificationId] = {
    ...(input.notificationType ? { notificationType: input.notificationType } : {}),
    receivedAt,
  };
  saveStore(store);
  return true;
}

function ensureStore(): void {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, JSON.stringify({ ids: {} }, null, 2), 'utf8');
}

function loadStore(): NotificationStore {
  ensureStore();
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Partial<NotificationStore>;
    return { ids: parsed.ids ?? {} };
  } catch {
    return { ids: {} };
  }
}

function saveStore(store: NotificationStore): void {
  ensureStore();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
