/// One message a person sent the Karwan number, reduced to what Karwan reads.
export interface InboundMessage {
  id: string;
  /// The sender's number as WhatsApp gives it: digits, no plus sign.
  from: string;
  /// Epoch milliseconds.
  timestamp: number;
  kind: 'text' | 'button' | 'list' | 'media' | 'other';
  /// Typed text, or a media caption.
  text?: string;
  /// The id of the button or list row the person tapped.
  replyId?: string;
  mediaId?: string;
  mimeType?: string;
}

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/// Pull every person-sent message out of a webhook body. Status callbacks
/// and anything malformed yield nothing rather than an error, because Meta
/// retries a webhook that fails and a bad body will never get better.
export function parseInbound(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of arr(obj(body)?.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      for (const raw of arr(obj(obj(change)?.value)?.messages)) {
        const m = toMessage(obj(raw));
        if (m) out.push(m);
      }
    }
  }
  return out;
}

function toMessage(m: Raw | null): InboundMessage | null {
  const id = str(m?.id);
  const from = str(m?.from);
  const seconds = Number(m?.timestamp);
  if (!m || !id || !from || !Number.isFinite(seconds)) return null;
  const base = { id, from, timestamp: seconds * 1000 };

  switch (m.type) {
    case 'text':
      return { ...base, kind: 'text', text: str(obj(m.text)?.body) ?? '' };
    case 'interactive': {
      const i = obj(m.interactive);
      const button = obj(i?.button_reply);
      if (button) return { ...base, kind: 'button', replyId: str(button.id), text: str(button.title) };
      const row = obj(i?.list_reply);
      if (row) return { ...base, kind: 'list', replyId: str(row.id), text: str(row.title) };
      return { ...base, kind: 'other' };
    }
    case 'button': {
      // A quick-reply button on a template message.
      const b = obj(m.button);
      return { ...base, kind: 'button', replyId: str(b?.payload), text: str(b?.text) };
    }
    case 'image':
    case 'document': {
      const media = obj(m[m.type]);
      return {
        ...base,
        kind: 'media',
        mediaId: str(media?.id),
        mimeType: str(media?.mime_type),
        text: str(media?.caption),
      };
    }
    default:
      return { ...base, kind: 'other' };
  }
}
