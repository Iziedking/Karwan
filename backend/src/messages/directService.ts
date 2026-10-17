import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../db/messages.js';
import { mayMessage, pairKey, warningFor, type SenderHistory } from './direct.js';

/// Messaging someone by tag before a deal. The tool and the site route both
/// send through here, so the spam pause, the escrow warning and the alert are
/// the same everywhere.

export interface DirectAlert {
  from: string;
  to: string;
  fromTag: string | null;
  preview: string;
  warning: string | null;
}

export interface DirectDeps {
  now: () => number;
  findByTag: (tag: string) => Promise<{ address: string; tag: string } | null>;
  tagOf: (address: string) => Promise<string | null>;
  getHistory: (address: string) => Promise<SenderHistory>;
  putHistory: (address: string, history: SenderHistory) => Promise<void>;
  add: (message: ChatMessage) => Promise<ChatMessage>;
  list: (key: string) => Promise<ChatMessage[]>;
  /// Every retained direct message the owner is part of.
  threadsFor: (owner: string) => Promise<ChatMessage[]>;
  hasDeal: (a: string, b: string) => Promise<boolean>;
  alert: (alert: DirectAlert) => Promise<void>;
  /// The link scanner trade chat uses; a flagged message is refused.
  scan: (text: string) => { verdict: 'clean' | 'suspicious' | 'malicious'; reasons: string[] };
  offense: (address: string, verdict: 'suspicious' | 'malicious', reasons: string[]) => void;
  /// Account deletion: who the person wrote to, and their direct messages.
  dropHistory: (address: string) => Promise<void>;
  dropMessages: (address: string) => Promise<void>;
}

export type SendRefusal = 'empty' | 'unknown_tag' | 'self' | 'paused' | 'no_tag' | 'wait_reply' | 'link_blocked';

export type SendResult =
  | { ok: true; message: ChatMessage; warning: string | null }
  | { ok: false; code: SendRefusal; message: string; until?: number };

export interface InboxRow {
  withTag: string | null;
  last: string;
  at: number;
  yourTurn: boolean;
}

const BODY_MAX = 2000;
const HISTORY_MAX = 500;
/// Messages in a row someone can send before the other person answers.
const UNANSWERED_RUN = 3;
const UNKNOWN = 'No one on Karwan has that tag.';

/// One send at a time per person, so parallel sends cannot slip past the
/// pause or lose a reply mark.
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(key: string, run: () => Promise<T>): Promise<T> {
  const prior = queues.get(key) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(run);
  const tail = next.catch(() => {});
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}
const lockedFor = <T>(a: string, b: string, run: () => Promise<T>) => {
  const [first, second] = [a, b].sort() as [string, string];
  return serialized(first, () => serialized(second, run));
};

function pausedText(until: number, now: number): string {
  const hours = Math.max(1, Math.ceil((until - now) / (60 * 60 * 1000)));
  return `You've written to five people today who haven't replied yet. You can write to someone new in about ${hours} hour${hours === 1 ? '' : 's'}.`;
}

export function createDirect(deps: DirectDeps) {
  async function send(from: string, toTag: string, body: string): Promise<SendResult> {
    const sender = from.toLowerCase();
    const text = body.trim().slice(0, BODY_MAX);
    if (!text) return { ok: false, code: 'empty', message: 'Write a message first.' };
    const to = await deps.findByTag(toTag);
    if (!to) return { ok: false, code: 'unknown_tag', message: UNKNOWN };
    const receiver = to.address.toLowerCase();
    if (receiver === sender) return { ok: false, code: 'self', message: "That's your own tag." };
    const fromTag = await deps.tagOf(sender);
    if (!fromTag) return { ok: false, code: 'no_tag', message: 'Pick a Karwan tag first so they can answer you.' };
    const scan = deps.scan(text);
    if (scan.verdict !== 'clean') {
      deps.offense(sender, scan.verdict, scan.reasons);
      return { ok: false, code: 'link_blocked', message: 'Karwan flagged a link in this message and will not send it.' };
    }
    return lockedFor(sender, receiver, () => deliver(sender, receiver, fromTag, text));
  }

  async function deliver(sender: string, receiver: string, fromTag: string, text: string): Promise<SendResult> {
    const now = deps.now();
    const key = pairKey(sender, receiver);
    const [history, theirs, thread] = await Promise.all([deps.getHistory(sender), deps.getHistory(receiver), deps.list(key)]);
    const opened = theirs.firstMessages.find((m) => m.to.toLowerCase() === sender);
    if (!opened) {
      const may = mayMessage({ from: sender, to: receiver, history, now });
      if (!may.ok) {
        const until = may.until ?? now;
        return { ok: false, code: 'paused', message: pausedText(until, now), until };
      }
    }
    let run = 0;
    for (const m of [...thread].sort((a, b) => a.ts - b.ts).reverse()) {
      if (m.sender.toLowerCase() !== sender) break;
      run += 1;
    }
    if (run >= UNANSWERED_RUN) {
      return { ok: false, code: 'wait_reply', message: `Wait for @${(await deps.tagOf(receiver)) ?? 'them'} to reply before you write again.` };
    }

    const warning = warningFor(text, await deps.hasDeal(sender, receiver));
    const message = await deps.add({
      id: `dm-${randomUUID()}`,
      jobId: key,
      channel: 'direct',
      channelKey: key,
      sender,
      kind: 'participant',
      body: text,
      ...(warning ? { warning } : {}),
      ts: now,
    });

    if (opened && !opened.answered) {
      opened.answered = true;
      await deps.putHistory(receiver, theirs);
    }
    if (!opened && !history.firstMessages.some((m) => m.to.toLowerCase() === receiver)) {
      history.firstMessages = [...history.firstMessages, { to: receiver, at: now, answered: false }].slice(-HISTORY_MAX);
      await deps.putHistory(sender, history);
    }

    await deps.alert({ from: sender, to: receiver, fromTag, preview: text, warning }).catch(() => {});
    return { ok: true, message, warning };
  }

  async function forget(address: string): Promise<void> {
    const a = address.toLowerCase();
    await deps.dropHistory(a);
    await deps.dropMessages(a);
  }

  async function list(owner: string, withTag: string): Promise<ChatMessage[]> {
    const other = await deps.findByTag(withTag);
    if (!other) return [];
    return (await deps.list(pairKey(owner, other.address))).sort((a, b) => a.ts - b.ts);
  }

  async function inbox(owner: string): Promise<InboxRow[]> {
    const me = owner.toLowerCase();
    const latest = new Map<string, ChatMessage>();
    for (const m of await deps.threadsFor(me)) {
      const key = m.channelKey ?? m.jobId;
      if (!key.startsWith('dm:') || !key.split(':').includes(me)) continue;
      const seen = latest.get(key);
      if (!seen || m.ts > seen.ts) latest.set(key, m);
    }
    const rows = await Promise.all(
      [...latest.entries()].map(async ([key, m]) => {
        const other = key.split(':').slice(1).find((a) => a !== me) ?? me;
        return { withTag: await deps.tagOf(other), last: m.body.slice(0, 200), at: m.ts, yourTurn: m.sender !== me };
      }),
    );
    return rows.sort((a, b) => b.at - a.at);
  }

  return { send, list, inbox, forget };
}
