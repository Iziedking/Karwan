import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { logger } from '../logger.js';
import { saveTelegramLink, findAddressByChatId, type TelegramLink } from '../db/telegramLinks.js';
import { bus, type KarwanEvent } from '../events.js';
import {
  appendOperatorMessage,
  appendUserMessage,
  closeConversation,
  findOpenConversationByAddress,
  type SupportConversation,
} from '../support/store.js';
import { sendSupportTranscriptEmail } from '../emails/supportTranscript.js';
import { notifyUserOfReply } from '../support/notify.js';

// Minimal Telegram Bot API client. Direct HTTP calls (no SDK), long-polling
// getUpdates so we don't need a public webhook in dev. When the token is
// unset, every public function returns a clean "not configured" signal so the
// rest of the backend keeps running.

const API = 'https://api.telegram.org';

interface PendingLink {
  token: string;
  address: string;
  createdAt: number;
  /// Required by the durable ephemeral store (createdAt + TOKEN_TTL_MS).
  expiresAt: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;
const POLL_TIMEOUT_S = 25;

const pending = durableEphemeralMap<PendingLink>('tg-link');
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
  const now = Date.now();
  pending.set(token, {
    token,
    address: address.toLowerCase(),
    createdAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  });
  const username = config.TELEGRAM_BOT_USERNAME;
  const deepLink = username ? `https://t.me/${username}?start=${token}` : null;
  return { token, deepLink };
}

interface InlineButton {
  text: string;
  url: string;
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  buttons?: InlineButton[],
  opts?: { plain?: boolean },
): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN) return;
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    };
    // Markdown is the default for our own copy. Operator-facing transcripts
    // carry user text that may contain stray * or _ and would 400 the whole
    // send under Markdown, so those go plain.
    if (!opts?.plain) body.parse_mode = 'Markdown';
    if (buttons && buttons.length > 0) {
      // Inline keyboards render as tappable buttons below the message and work
      // reliably across mobile + desktop clients, where embedded markdown
      // links are sometimes stripped. The URL must still be reachable from
      // the recipient's device. localhost won't open on a phone.
      body.reply_markup = {
        inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))],
      };
    }
    const res = await fetch(`${API}/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const respBody = await res.text();
      logger.warn({ status: res.status, body: respBody }, 'telegram sendMessage failed');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'telegram sendMessage error');
  }
}

/// Sends a photo by URL. Telegram fetches the URL itself, so it must be
/// publicly reachable (PUBLIC_API_BASE_URL, not localhost). Caption is
/// optional and rendered as Markdown. No-ops without a token.
export async function sendTelegramPhoto(
  chatId: number,
  photoUrl: string,
  caption?: string,
): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN) return;
  try {
    const body: Record<string, unknown> = { chat_id: chatId, photo: photoUrl };
    if (caption) {
      body.caption = caption;
      body.parse_mode = 'Markdown';
    }
    const res = await fetch(`${API}/bot${config.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const respBody = await res.text();
      logger.warn({ status: res.status, body: respBody }, 'telegram sendPhoto failed');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'telegram sendPhoto error');
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
            reply_to_message?: { text?: string };
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
  reply_to_message?: { text?: string };
}) {
  const text = message.text ?? '';
  const chatId = message.chat.id;
  const username = message.chat.username;

  // Operator replies to live-support requests arrive in the support chat. A
  // reply to the bot's request message carries the #KSUP tag in the quoted
  // text; an explicit `/r KSUP-xxxx ...` works without quoting. Handle this
  // before the linking commands so an operator's reply is never mistaken for a
  // /start or treated as a normal user message.
  const opChat = supportOperatorChatId();
  if (opChat !== null && chatId === opChat) {
    if (await handleOperatorMessage(chatId, text, message.reply_to_message?.text)) return;
  }

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
    // One Telegram chat maps to exactly one wallet. If this chat is already
    // paired to a different wallet, refuse rather than silently linking it to a
    // second account. Re-linking the same wallet is allowed (idempotent).
    const ownerAddr = await findAddressByChatId(chatId);
    if (ownerAddr && ownerAddr !== link.address) {
      await sendTelegramMessage(
        chatId,
        `*Karwan*: this Telegram is already linked to \`${short(ownerAddr)}\`. Unlink it from that account first, then connect this wallet.`,
      );
      return;
    }
    const saved: TelegramLink = {
      address: link.address,
      chatId,
      username,
      linkedAt: Date.now(),
    };
    await saveTelegramLink(saved);
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

  // A linked user typing here while they have an open support ticket: route it
  // into that ticket so the operator sees it, same as a widget or email reply.
  // (The operator chat is handled above and returns before this point.)
  const linkedAddr = await findAddressByChatId(chatId);
  if (linkedAddr) {
    const ticket = findOpenConversationByAddress(linkedAddr);
    if (ticket) {
      appendUserMessage(ticket.id, text);
      try {
        await relaySupportUserMessage(ticket, text);
      } catch {
        /* operator relay best-effort */
      }
    }
  }
}

async function findLinkedAddressForChat(chatId: number): Promise<string | null> {
  return findAddressByChatId(chatId);
}

// --- live support: operator side over Telegram ---

/// The chat that receives live-support handoffs. Falls back to the feedback
/// chat so a solo operator only needs one. Null = the handoff is disabled and
/// the frontend hides the "talk to a human" action.
export function supportOperatorChatId(): number | null {
  return config.SUPPORT_TELEGRAM_CHAT_ID ?? config.FEEDBACK_TELEGRAM_CHAT_ID ?? null;
}

export function supportHandoffEnabled(): boolean {
  return telegramEnabled() && supportOperatorChatId() !== null;
}

const CONV_TAG_RE = /(KSUP-[0-9a-f]+)/i;

function roleTag(role: 'user' | 'assistant' | 'operator' | 'system'): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'AI';
    case 'operator':
      return 'You';
    default:
      return 'System';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/// Routes an operator's Telegram message to the right conversation. Returns true
/// when the message was a support action (handled), false to let normal command
/// handling run. A reply to the request message carries the #KSUP tag; `/r` and
/// `/close` work without quoting.
async function handleOperatorMessage(
  chatId: number,
  text: string,
  repliedText?: string,
): Promise<boolean> {
  const trimmed = text.trim();

  const closeMatch = trimmed.match(/^\/close\s+(KSUP-[0-9a-f]+)/i);
  if (closeMatch) {
    const convo = closeConversation(closeMatch[1]!);
    if (convo) void sendSupportTranscriptEmail(convo);
    await sendTelegramMessage(
      chatId,
      convo
        ? `*Karwan*: closed \`${closeMatch[1]}\` and emailed the transcript.`
        : `*Karwan*: no open conversation \`${closeMatch[1]}\`.`,
    );
    return true;
  }

  let convId: string | null = null;
  let body = trimmed;
  const explicit = trimmed.match(/^\/r\s+(KSUP-[0-9a-f]+)\s+([\s\S]+)/i);
  if (explicit) {
    convId = explicit[1]!;
    body = explicit[2]!;
  } else if (repliedText) {
    const m = repliedText.match(CONV_TAG_RE);
    if (m) convId = m[1]!;
  }
  if (!convId) return false;

  const convo = appendOperatorMessage(convId, body);
  if (!convo) {
    await sendTelegramMessage(
      chatId,
      `*Karwan*: \`${convId}\` is closed or unknown, so the user won't see that. Start fresh when they re-open the chat.`,
    );
    return true;
  }
  // Reach the user on every channel they have: email, Telegram, and the widget.
  void notifyUserOfReply(convo, body);
  return true;
}

/// Pushes a new live-support request (with its AI transcript) to the operator
/// chat. The #KSUP tag at the foot is what an operator reply quotes back so we
/// can route the response. No-op when the handoff isn't configured.
export async function sendSupportRequestToOperator(convo: SupportConversation): Promise<void> {
  const chatId = supportOperatorChatId();
  if (chatId === null) return;
  const lines = convo.messages
    .slice(-12)
    .map((m) => `${roleTag(m.role)}: ${truncate(m.text, 600)}`);
  const who = convo.address ? short(convo.address) : 'a guest';
  const head = `Live support request from ${who}\n${convo.id}`;
  const tail =
    `Reply to this message to respond. Or: /r ${convo.id} your reply  •  /close ${convo.id} to end + email it.`;
  await sendTelegramMessage(
    chatId,
    `${head}\n\n${lines.join('\n')}\n\n${tail}\n#${convo.id}`,
    undefined,
    { plain: true },
  );
}

/// Relays a user's follow-up message (sent after handoff) to the operator chat,
/// tagged so a reply routes back to the same conversation.
export async function relaySupportUserMessage(convo: SupportConversation, text: string): Promise<void> {
  const chatId = supportOperatorChatId();
  if (chatId === null) return;
  const who = convo.address ? short(convo.address) : 'guest';
  await sendTelegramMessage(
    chatId,
    `${who} (${convo.id}):\n${truncate(text, 1200)}\n\n#${convo.id}`,
    undefined,
    { plain: true },
  );
}

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (v.expiresAt < now) pending.delete(k);
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
