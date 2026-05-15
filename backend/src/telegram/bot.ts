import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { saveTelegramLink, getTelegramLink, type TelegramLink } from '../db/telegramLinks.js';
import { bus, type KarwanEvent } from '../events.js';

// Minimal Telegram Bot API client. Direct HTTP calls (no SDK), long-polling
// getUpdates so we don't need a public webhook in dev. When the token is
// unset, every public function returns a clean "not configured" signal so the
// rest of the backend keeps running.

const API = 'https://api.telegram.org';

interface PendingLink {
  token: string;
  address: string;
  createdAt: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;
const POLL_TIMEOUT_S = 25;

const pending = new Map<string, PendingLink>();
let lastUpdateId = 0;
let stopped = false;

export function telegramEnabled(): boolean {
  return !!config.TELEGRAM_BOT_TOKEN;
}

export function telegramUsername(): string | null {
  return config.TELEGRAM_BOT_USERNAME ?? null;
}

/// Mint a one-time linking token for an address. The user clicks a deep link
/// that opens Telegram with `/start <token>`, then the bot pairs the chat to
/// the address. Tokens expire after 10 min so a stale link can't be hijacked.
export function generateLinkToken(address: string): { token: string; deepLink: string | null } {
  pruneExpired();
  const token = randomBytes(12).toString('hex');
  pending.set(token, { token, address: address.toLowerCase(), createdAt: Date.now() });
  const username = config.TELEGRAM_BOT_USERNAME;
  const deepLink = username ? `https://t.me/${username}?start=${token}` : null;
  return { token, deepLink };
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN) return;
  try {
    const res = await fetch(`${API}/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body }, 'telegram sendMessage failed');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'telegram sendMessage error');
  }
}

/// Start the long-polling loop. Returns a stop function. Safe to call even
/// without a token configured: just no-ops.
export function startTelegramBot(): () => void {
  if (!config.TELEGRAM_BOT_TOKEN) {
    logger.info('TELEGRAM_BOT_TOKEN not set, telegram bot disabled');
    return () => {};
  }
  stopped = false;
  logger.info('telegram bot starting');
  void loop();
  return () => {
    stopped = true;
  };
}

async function loop() {
  while (!stopped) {
    try {
      const url = new URL(`${API}/bot${config.TELEGRAM_BOT_TOKEN}/getUpdates`);
      url.searchParams.set('timeout', String(POLL_TIMEOUT_S));
      if (lastUpdateId) url.searchParams.set('offset', String(lastUpdateId + 1));
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.text();
        logger.warn({ status: res.status, body }, 'telegram getUpdates non-2xx');
        await sleep(2_000);
        continue;
      }
      const json = (await res.json()) as {
        ok: boolean;
        result?: Array<{
          update_id: number;
          message?: {
            chat: { id: number; type: string; username?: string };
            text?: string;
          };
        }>;
      };
      if (!json.ok || !json.result) continue;
      for (const u of json.result) {
        lastUpdateId = Math.max(lastUpdateId, u.update_id);
        if (u.message?.text) await handleMessage(u.message);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'telegram poll error');
      await sleep(2_000);
    }
  }
}

async function handleMessage(message: {
  chat: { id: number; type: string; username?: string };
  text?: string;
}) {
  const text = message.text ?? '';
  const chatId = message.chat.id;
  const username = message.chat.username;

  if (text.startsWith('/start ')) {
    const token = text.slice('/start '.length).trim();
    pruneExpired();
    const link = pending.get(token);
    if (!link) {
      await sendTelegramMessage(
        chatId,
        '*Karwan*: that linking code expired or is invalid. Generate a fresh one from your profile and try again.',
      );
      return;
    }
    pending.delete(token);
    const saved: TelegramLink = {
      address: link.address,
      chatId,
      username,
      linkedAt: Date.now(),
    };
    await saveTelegramLink(saved);
    chatIdReverse.set(chatId, link.address);
    bus.emitEvent({
      type: 'telegram.linked',
      actor: 'platform',
      payload: { address: link.address, chatId, username },
    });
    await sendTelegramMessage(
      chatId,
      `*Karwan*: linked to \`${short(link.address)}\`. You'll get alerts here for deals, chat messages, and bridge updates.`,
    );
    // Catch the user up on anything that already happened for this wallet
    // before they linked. Events fire forward-only, so without this a deal
    // opened minutes earlier would never show up here.
    await sendCatchupSummary(chatId, link.address);
    return;
  }

  if (text === '/start') {
    await sendTelegramMessage(
      chatId,
      "*Karwan*: open your profile in the app and click *Connect Telegram* to get a one-time link.",
    );
    return;
  }

  if (text === '/status') {
    const known = await findLinkedAddressForChat(chatId);
    if (known) {
      await sendTelegramMessage(chatId, `*Karwan*: linked to \`${short(known)}\`.`);
    } else {
      await sendTelegramMessage(chatId, '*Karwan*: this chat is not linked to a wallet yet.');
    }
    return;
  }
}

// In-memory chatId → address index, populated when we save a link in this
// process. The persisted store is keyed by address, so reverse lookups would
// otherwise need a scan; this covers the /status command for the happy path.
const chatIdReverse = new Map<number, string>();

async function findLinkedAddressForChat(chatId: number): Promise<string | null> {
  void getTelegramLink;
  return chatIdReverse.get(chatId) ?? null;
}

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (now - v.createdAt > TOKEN_TTL_MS) pending.delete(k);
  }
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Events worth replaying when a wallet links Telegram. Mirrors the live
// notifier's relevant set so the catch-up speaks the same vocabulary.
const CATCHUP_TYPES = new Set([
  'deal.direct.created',
  'deal.accepted',
  'deal.delivered',
  'deal.review.started',
  'deal.auto_released',
  'escrow.settled',
  'deal.disputed',
  'deal.cancelled',
  'deal.fund.insufficient',
  'chat.message',
]);

function catchupLine(e: KarwanEvent, address: string): string | null {
  const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
  const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
  const role: 'buyer' | 'seller' | null =
    buyer === address ? 'buyer' : seller === address ? 'seller' : null;
  if (!role) return null;
  switch (e.type) {
    case 'deal.direct.created':
      return role === 'seller'
        ? 'A new deal was offered to you'
        : 'You opened a deal, awaiting seller acceptance';
    case 'deal.accepted':
      return 'A deal was accepted and the escrow funded';
    case 'deal.delivered':
      return role === 'buyer' ? 'The seller marked the work delivered' : 'You marked a deal delivered';
    case 'deal.review.started':
      return 'A buyer review window opened';
    case 'deal.auto_released':
      return 'A milestone auto-released';
    case 'escrow.settled':
      return 'A deal settled in full';
    case 'deal.disputed':
      return 'A deal moved to dispute';
    case 'deal.cancelled':
      return 'A deal was cancelled';
    case 'deal.fund.insufficient':
      return role === 'buyer'
        ? "Your buyer agent ran out of USDC mid-accept"
        : "The buyer agent was underfunded";
    case 'chat.message': {
      const sender = (e.payload?.sender as string | undefined)?.toLowerCase();
      if (sender === address) return null;
      return 'A chat message arrived from the other party';
    }
    default:
      return null;
  }
}

/// Sends a short summary of recent events that fired for this wallet before
/// the link existed. Capped at the most recent 5 so the chat isn't spammed.
async function sendCatchupSummary(chatId: number, address: string): Promise<void> {
  const recent = bus.recent(80);
  const lines: string[] = [];
  // recent() returns newest-first; reverse so the digest reads chronologically.
  for (const e of [...recent].reverse()) {
    if (!CATCHUP_TYPES.has(e.type)) continue;
    const line = catchupLine(e, address);
    if (!line) continue;
    lines.push(`• ${line}`);
  }
  if (lines.length === 0) return;
  const tail = lines.slice(-5);
  await sendTelegramMessage(
    chatId,
    `*Catching you up* on what happened before this link:\n${tail.join('\n')}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
