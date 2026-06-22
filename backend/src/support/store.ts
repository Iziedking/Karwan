import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';

/// Live-support conversations. A user can hand off from the AI assistant to a
/// human; the human replies over Telegram and the reply relays back to the
/// widget. State lives in memory plus a debounced flat-file (data/support.json)
/// so it survives a restart without a Postgres table. Closed conversations are
/// archived by email, then pruned, so this store never grows unbounded.

export type SupportRole = 'user' | 'assistant' | 'operator' | 'system';

export interface SupportMessage {
  role: SupportRole;
  text: string;
  ts: number;
}

export interface SupportConversation {
  id: string;
  /// Wallet address of the requester when known (signed-in users), lowercased.
  address?: string;
  /// Email for the close-out archive when known. For email-origin tickets this
  /// is the sender, and operator replies are emailed back to it.
  email?: string;
  /// Where the ticket originated. 'widget' replies reach the user by poll;
  /// 'email' replies are emailed back to `email`. Absent reads as 'widget'.
  channel?: 'widget' | 'email';
  /// Last inbound email subject, so a reply keeps the "Re: …" thread + Ticket id.
  subject?: string;
  status: 'open' | 'closed';
  messages: SupportMessage[];
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

const STORE_PATH = resolve(process.cwd(), 'data', 'support.json');
const PERSIST_DEBOUNCE_MS = 800;
/// Keep a closed conversation around briefly so a late poll still drains the
/// final operator line, then drop it. The email archive is the durable record.
const CLOSED_RETENTION_MS = 60 * 60 * 1000; // 1h
/// An open conversation with no activity for this long is auto-closed and
/// archived, so an abandoned widget doesn't leak an open thread forever.
const OPEN_IDLE_MS = 12 * 60 * 60 * 1000; // 12h
/// Cap a single conversation so a runaway client can't grow the file without
/// bound. Old turns drop; the email archive still holds the head via the live
/// transcript captured at handoff.
const MAX_MESSAGES = 200;

const conversations = new Map<string, SupportConversation>();
let persistTimer: NodeJS.Timeout | null = null;

function load(): void {
  if (!existsSync(STORE_PATH)) return;
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const arr = JSON.parse(raw) as SupportConversation[];
    if (Array.isArray(arr)) {
      for (const c of arr) conversations.set(c.id, c);
    }
  } catch {
    /* a corrupt file just starts empty; not worth crashing boot */
  }
}
load();

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const dir = dirname(STORE_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(STORE_PATH, JSON.stringify([...conversations.values()]), 'utf8');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'support store persist failed');
    }
  }, PERSIST_DEBOUNCE_MS);
}

function newId(): string {
  return `KSUP-${randomBytes(5).toString('hex')}`;
}

export function createConversation(input: {
  address?: string;
  email?: string;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
}): SupportConversation {
  const now = Date.now();
  const messages: SupportMessage[] = input.transcript
    .filter((t) => t.content.trim().length > 0)
    .slice(-40)
    .map((t) => ({ role: t.role, text: t.content, ts: now }));
  const convo: SupportConversation = {
    id: newId(),
    address: input.address?.toLowerCase(),
    email: input.email?.toLowerCase(),
    channel: 'widget',
    status: 'open',
    messages,
    createdAt: now,
    updatedAt: now,
  };
  conversations.set(convo.id, convo);
  schedulePersist();
  return convo;
}

export function getConversation(id: string): SupportConversation | null {
  return conversations.get(id) ?? null;
}

/// Open an email-origin ticket (someone emailed support directly, not via the
/// widget). Operator replies are emailed back to `email`.
export function createEmailConversation(input: {
  email: string;
  subject: string;
  text: string;
}): SupportConversation {
  const now = Date.now();
  const convo: SupportConversation = {
    id: newId(),
    email: input.email.toLowerCase(),
    channel: 'email',
    subject: input.subject.slice(0, 200),
    status: 'open',
    messages: [{ role: 'user', text: input.text.trim().slice(0, 4000), ts: now }],
    createdAt: now,
    updatedAt: now,
  };
  conversations.set(convo.id, convo);
  schedulePersist();
  return convo;
}

/// Open conversations, most-recently-active first. For the admin tickets view.
export function listOpenConversations(): SupportConversation[] {
  return [...conversations.values()]
    .filter((c) => c.status === 'open')
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/// The caller's most-recently-active OPEN ticket, by wallet. Used to route a
/// reply that arrives on another channel (Telegram, inbound email) back into
/// the one ticket the user already has open.
export function findOpenConversationByAddress(address: string): SupportConversation | null {
  const a = address.toLowerCase();
  return (
    [...conversations.values()]
      .filter((c) => c.status === 'open' && c.address === a)
      .sort((x, y) => y.updatedAt - x.updatedAt)[0] ?? null
  );
}

function append(id: string, role: SupportRole, text: string): SupportConversation | null {
  const convo = conversations.get(id);
  if (!convo || convo.status === 'closed') return null;
  const trimmed = text.trim();
  if (!trimmed) return convo;
  convo.messages.push({ role, text: trimmed.slice(0, 4000), ts: Date.now() });
  if (convo.messages.length > MAX_MESSAGES) {
    convo.messages = convo.messages.slice(-MAX_MESSAGES);
  }
  convo.updatedAt = Date.now();
  schedulePersist();
  return convo;
}

export function appendUserMessage(id: string, text: string): SupportConversation | null {
  return append(id, 'user', text);
}

export function appendOperatorMessage(id: string, text: string): SupportConversation | null {
  return append(id, 'operator', text);
}

/// Messages strictly newer than `since` (epoch ms). The widget polls with the
/// ts of the last message it rendered, so it only ever pulls the delta.
export function messagesSince(id: string, since: number): SupportMessage[] {
  const convo = conversations.get(id);
  if (!convo) return [];
  return convo.messages.filter((m) => m.ts > since);
}

export function closeConversation(id: string): SupportConversation | null {
  const convo = conversations.get(id);
  if (!convo) return null;
  if (convo.status !== 'closed') {
    convo.status = 'closed';
    convo.closedAt = Date.now();
    convo.updatedAt = convo.closedAt;
    schedulePersist();
  }
  return convo;
}

export function deleteConversation(id: string): void {
  if (conversations.delete(id)) schedulePersist();
}

/// Drop closed conversations past retention and auto-close stale open ones.
/// Returns the conversations that were just auto-closed so the caller can
/// archive them. Run on a slow interval from the route module.
export function sweep(): SupportConversation[] {
  const now = Date.now();
  const autoClosed: SupportConversation[] = [];
  for (const [id, c] of conversations) {
    if (c.status === 'closed' && c.closedAt && now - c.closedAt > CLOSED_RETENTION_MS) {
      conversations.delete(id);
      continue;
    }
    if (c.status === 'open' && now - c.updatedAt > OPEN_IDLE_MS) {
      c.status = 'closed';
      c.closedAt = now;
      c.updatedAt = now;
      autoClosed.push(c);
    }
  }
  if (autoClosed.length > 0) schedulePersist();
  return autoClosed;
}
