import { logger } from '../logger.js';
import type { OutMessage } from '../channels/render.js';

/// Meta lets a business reply freely for 24 hours after the person's last
/// message. A small margin keeps a send near the edge from being refused.
const WINDOW_MS = 24 * 3_600_000 - 5 * 60_000;

export interface OutboxDeps {
  token: string | undefined;
  phoneNumberId: string | undefined;
  graphVersion: string;
  now: () => number;
  lastInboundAt: (to: string) => Promise<number | null>;
  /// True when this number may receive a message outside the window today.
  claimDailySlot: (to: string, day: string) => Promise<boolean>;
  enqueue: (to: string, m: OutMessage) => Promise<void>;
  takeQueue: (to: string) => Promise<OutMessage[]>;
  fetch: typeof fetch;
}

export type SendResult = { sent: boolean; queued?: true };

export function createOutbox(deps: OutboxDeps) {
  async function post(to: string, m: OutMessage): Promise<boolean> {
    if (!deps.token || !deps.phoneNumberId) {
      logger.warn('whatsapp: send skipped, token or phone number id not configured');
      return false;
    }
    const url = `https://graph.facebook.com/${deps.graphVersion}/${deps.phoneNumberId}/messages`;
    try {
      const res = await deps.fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload(m) }),
      });
      if (res.ok) return true;
      const detail = await res.text().catch(() => '');
      logger.warn({ status: res.status, detail: detail.slice(0, 300) }, 'whatsapp: Graph API refused a message');
      return false;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'whatsapp: Graph API unreachable');
      return false;
    }
  }

  const today = () => new Date(deps.now()).toISOString().slice(0, 10);

  async function send(to: string, m: OutMessage): Promise<SendResult> {
    if (m.kind === 'template') {
      if (!(await deps.claimDailySlot(to, today()))) {
        await deps.enqueue(to, m);
        return { sent: false, queued: true };
      }
      return { sent: await post(to, m) };
    }
    const last = await deps.lastInboundAt(to);
    if (last !== null && deps.now() - last < WINDOW_MS) return { sent: await post(to, m) };

    // Outside the window: keep the real message for when the person writes
    // back, and send an approved template that asks them to.
    await deps.enqueue(to, m);
    if (await deps.claimDailySlot(to, today())) {
      await post(to, { kind: 'template', name: 'deal_update', params: [preview(m)] });
    }
    return { sent: false, queued: true };
  }

  /// Send what was held back, in order. Called when the person writes, which
  /// reopens the window.
  async function drain(to: string): Promise<void> {
    for (const m of await deps.takeQueue(to)) await post(to, m);
  }

  return { send, drain };
}

function payload(m: OutMessage): Record<string, unknown> {
  switch (m.kind) {
    case 'text':
      return { type: 'text', text: { body: m.body, preview_url: true } };
    case 'link':
      return { type: 'text', text: { body: `${m.body}\n\n${m.label}: ${m.url}`, preview_url: false } };
    case 'buttons':
      return {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: m.body },
          action: { buttons: m.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
        },
      };
    case 'template':
      return {
        type: 'template',
        template: {
          name: m.name,
          language: { code: 'en' },
          components: [
            { type: 'body', parameters: m.params.map((p) => ({ type: 'text', text: flat(p) })) },
            ...(m.buttonIds ?? []).map((id, index) => ({
              type: 'button',
              sub_type: 'quick_reply',
              index: String(index),
              parameters: [{ type: 'payload', payload: id }],
            })),
          ],
        },
      };
  }
}

/// Meta rejects template parameters with line breaks, tabs or long runs of
/// spaces.
function flat(s: string): string {
  return s.replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000);
}

function preview(m: OutMessage): string {
  const body = m.kind === 'template' ? m.params.join(' ') : m.body;
  const firstLine = flat(body.replace(/\*/g, ''));
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}
