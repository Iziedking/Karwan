import type { OutMessage } from './render.js';
import type { InboundMessage } from './types.js';
import {
  captionPurpose,
  putSentFile,
  sentFileLine,
  sniffSent,
  type SentFile,
  type SentFileReading,
  type SentType,
  type UseSentDeps,
  type sentFileStore,
} from './sentFiles.js';

/// What a file sent to the assistant comes to (view 66).
/// - `turn: false`: a clear caption already put it somewhere; the note and the
///   replies go into the chat so the assistant knows.
/// - `turn: true`: it is held, and the assistant answers the note with the
///   whole chat in view: it puts the file where the chat says, or asks.
/// - no note: it could not be opened; nothing goes into the chat.
export type FileArrival =
  | { replies: OutMessage[]; note: string; turn: boolean }
  | { replies: OutMessage[]; note?: undefined; turn?: undefined };

export interface FileArrivalDeps extends Omit<UseSentDeps, 'store'> {
  store: ReturnType<typeof sentFileStore>;
  /// What the picture shows, read once. Null when it could not be read.
  describe: (bytes: Uint8Array, mimeType: SentType) => Promise<SentFileReading | null>;
}

const text = (body: string): OutMessage => ({ kind: 'text', body });

export async function fileArrived(
  address: string,
  file: { bytes: Uint8Array; mimeType: string } | null,
  caption: string | undefined,
  deps: FileArrivalDeps,
): Promise<FileArrival> {
  if (!file) return { replies: [text("I couldn't open that file. Please send it again, under 10 MB.")] };
  const type = sniffSent(file.bytes);
  if (!type) return { replies: [text('Please send a photo (JPEG, PNG or WebP) or a PDF.')] };
  const sent: SentFile = { bytes: file.bytes, mimeType: type };
  const photo = type.startsWith('image/');

  const purpose = captionPurpose(caption, photo);
  if (purpose) {
    const { lines } = await putSentFile(address, purpose, sent, deps);
    return { replies: lines.filter(Boolean).map(text), note: sentFileLine({ photo, caption, outcome: lines.join(' ') }), turn: false };
  }

  const reading = await deps.describe(sent.bytes, type);
  const held = deps.store.hold(address, sent.bytes, deps.now());
  if ('error' in held) return { replies: [text(held.error)] };
  return { replies: [], note: sentFileLine({ photo, caption, reading }), turn: true };
}

/// The live intake a chat app uses: the channel's own download, then the
/// shared rules above with the live model, store and invoice reader.
export function createChatFileIntake(opts: {
  channel: 'telegram' | 'whatsapp';
  download: (mediaId: string, mimeType?: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>;
}) {
  return async function intake(address: string, m: InboundMessage): Promise<FileArrival> {
    if (!m.mediaId) return { replies: [text("I couldn't open that file. Please send it again.")] };
    const [{ sentFiles, readInvoiceLive }, { describeSentFile }] = await Promise.all([import('./sentFiles.js'), import('./describeSentFile.js')]);
    return fileArrived(address, await opts.download(m.mediaId, m.mimeType), m.text, {
      now: Date.now,
      store: sentFiles,
      describe: describeSentFile,
      readInvoice: (a, f) => readInvoiceLive(a, f, opts.channel),
    });
  };
}

/// Keeps a chat app's turns as the person's conversations (view 66).
export function keepChat(source: 'telegram' | 'whatsapp') {
  return async (address: string, id: string | null, messages: Array<{ role: 'user' | 'assistant'; content: string; actions?: unknown[] }>) => {
    const { appendToConversation } = await import('../db/assistantConversations.js');
    try {
      return (await appendToConversation(address, id, messages, source)).id;
    } catch (err) {
      // A conversation deleted on the website starts a new one here.
      if (id && (err as Error).message === 'not_found') return (await appendToConversation(address, null, messages, source)).id;
      throw err;
    }
  };
}
