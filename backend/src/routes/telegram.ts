import { Hono } from 'hono';
import { z } from 'zod';
import { getTelegramLink, removeTelegramLink } from '../db/telegramLinks.js';
import { generateLinkToken, telegramEnabled, telegramUsername } from '../telegram/bot.js';
import { isSessionSelf } from '../auth/session.js';

const addrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const telegramRoutes = new Hono();

/// Linked status for one address. The frontend polls this after opening the
/// deep link so the UI can flip to "connected" without a refresh.
telegramRoutes.get('/status', async (c) => {
  const address = c.req.query('address');
  if (!address || !addrSchema.safeParse(address).success) {
    return c.json({ error: 'address query param required' }, 400);
  }
  const link = await getTelegramLink(address);
  return c.json({
    enabled: telegramEnabled(),
    botUsername: telegramUsername(),
    linked: !!link,
    chatId: link?.chatId ?? null,
    username: link?.username ?? null,
    linkedAt: link?.linkedAt ?? null,
  });
});

/// Mint a fresh one-time link token. The token is encoded in a deep link the
/// user opens to pair their Telegram chat to their wallet.
telegramRoutes.post('/link/start', async (c) => {
  if (!telegramEnabled()) {
    return c.json({ error: 'telegram bot is not configured on this server' }, 503);
  }
  let body;
  try {
    body = z.object({ address: addrSchema }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  // Only the signed-in owner of this address can pair a Telegram chat to it.
  // Unauthenticated, anyone could route a victim's deal alerts to their own
  // chat by pairing first.
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'sign in as this address to link Telegram' }, 403);
  }
  const { token, deepLink } = generateLinkToken(body.address);
  return c.json({ token, deepLink, botUsername: telegramUsername() });
});

telegramRoutes.post('/link/remove', async (c) => {
  let body;
  try {
    body = z.object({ address: addrSchema }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  // Same gate: without it, anyone could silently unlink a victim's
  // notifications right before an attack window.
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'sign in as this address to unlink Telegram' }, 403);
  }
  await removeTelegramLink(body.address);
  return c.json({ ok: true });
});
