/// A photo or PDF sent to the assistant with nothing to say what it is for
/// (view 66). It is held for an hour, a line saying what it shows goes into the
/// chat, and the assistant puts it where the chat says with use_sent_photo:
/// on an offer, a delivery, a request or deal, a contest entry, or read as an
/// invoice for the record. Nothing is read as an invoice by default.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { holdForOffer, isOfferPhotoCaption, sniffPhoto } from '../listings/photos.js';
import { holdForDelivery, isDeliveryPhotoCaption } from '../deals/deliveryPhotos.js';
import { holdForDraft, isDraftCaption } from '../attachments/attachments.js';
import { holdForEntry, isEntryCaption } from '../contests/entryFiles.js';

export const MAX_SENT_FILES = 4;
export const SENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
const HELD_FOR_MS = 60 * 60_000;

export type SentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export interface SentFile {
  bytes: Uint8Array;
  mimeType: SentType;
}

const EXT: Record<SentType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const BY_EXT: Record<string, SentType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
const ADDRESS = /^0x[a-f0-9]{40}$/i;

/// What a file really is, from its first bytes.
export function sniffSent(bytes: Uint8Array): SentType | null {
  const photo = sniffPhoto(bytes);
  if (photo) return photo;
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  return null;
}

export function sentFileStore(root: string = resolve(process.cwd(), 'data', 'sent-files')) {
  const dirOf = (address: string) => join(root, address.toLowerCase());

  function live(address: string, now: number): string[] {
    if (!ADDRESS.test(address)) return [];
    const dir = dirOf(address);
    if (!existsSync(dir)) return [];
    const keep: string[] = [];
    for (const name of readdirSync(dir).sort()) {
      const at = Number(name.split('-')[0]);
      if (!Number.isFinite(at) || now - at > HELD_FOR_MS) rmSync(join(dir, name), { force: true });
      else keep.push(name);
    }
    return keep;
  }

  return {
    hold(address: string, bytes: Uint8Array, now: number): { held: number; mimeType: SentType } | { error: string } {
      if (!ADDRESS.test(address)) return { error: 'No account to hold the file for.' };
      if (bytes.length > SENT_FILE_MAX_BYTES) return { error: 'That file is over 10 MB. Send a smaller one.' };
      const mimeType = sniffSent(bytes);
      if (!mimeType) return { error: 'Send a photo (JPEG, PNG or WebP) or a PDF.' };
      const held = live(address, now);
      if (held.length >= MAX_SENT_FILES) {
        return { error: `I'm holding ${MAX_SENT_FILES} files already. Tell me what they are for first.` };
      }
      mkdirSync(dirOf(address), { recursive: true });
      writeFileSync(join(dirOf(address), `${now}-${randomBytes(4).toString('hex')}.${EXT[mimeType]}`), bytes);
      return { held: held.length + 1, mimeType };
    },

    count(address: string, now: number): number {
      return live(address, now).length;
    },

    /// The held files, oldest first, removed from the hold.
    take(address: string, now: number): SentFile[] {
      const out: SentFile[] = [];
      for (const name of live(address, now)) {
        const mimeType = BY_EXT[name.split('.').pop() ?? ''];
        const path = join(dirOf(address), name);
        if (mimeType) out.push({ bytes: new Uint8Array(readFileSync(path)), mimeType });
        rmSync(path, { force: true });
      }
      return out;
    },

    clear(address: string): void {
      if (ADDRESS.test(address)) rmSync(dirOf(address), { recursive: true, force: true });
    },
  };
}

/// The store the app uses, under data/sent-files.
export const sentFiles = sentFileStore();

export type SentPurpose = 'offer' | 'delivery' | 'request' | 'entry' | 'record';

/// What a caption says the file is for, when it says so plainly. Null leaves
/// it to the assistant and the chat.
export function captionPurpose(caption: string | undefined, isPhoto: boolean): SentPurpose | null {
  if (!caption?.trim()) return null;
  if (/\b(?:invoices?|receipts?|for my record|add to my record)\b/i.test(caption)) return 'record';
  if (isEntryCaption(caption)) return 'entry';
  if (isPhoto && isOfferPhotoCaption(caption)) return 'offer';
  if (isPhoto && isDeliveryPhotoCaption(caption)) return 'delivery';
  if (isDraftCaption(caption)) return 'request';
  return null;
}

/// What the picture shows, read once on arrival. Kind is a rough sort; shows
/// is one or two plain sentences.
export interface SentFileReading {
  kind: 'item' | 'parcel' | 'document' | 'screenshot' | 'other';
  shows: string;
}

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim().slice(0, n);

/// The line written into the chat so the assistant, and the conversation kept
/// for later, know a file arrived and what it shows.
export function sentFileLine(input: { photo: boolean; caption?: string; reading?: SentFileReading | null; outcome?: string }): string {
  const what = input.photo ? 'a photo' : 'a PDF';
  const caption = input.caption?.trim() ? `, caption "${clip(input.caption, 200)}"` : ', no caption';
  const shows = input.reading?.shows ? ` It shows ${clip(input.reading.shows, 300).replace(/^(?:it shows|this shows|shows)\s+/i, '').replace(/\.?$/, '.')}` : '';
  const kind = input.reading && input.reading.kind !== 'other' ? ` Kind: ${input.reading.kind}.` : '';
  const outcome = input.outcome ? ` ${clip(input.outcome, 200)}` : '';
  return `[I sent ${what}${caption}.${shows}${kind}${outcome}]`;
}

export interface UseSentDeps {
  now: () => number;
  store: ReturnType<typeof sentFileStore>;
  /// Reads a file as an invoice for the person's record: the reply lines.
  readInvoice: (address: string, file: SentFile) => Promise<string[]>;
  holdForOffer?: typeof holdForOffer;
  holdForDelivery?: typeof holdForDelivery;
  holdForDraft?: typeof holdForDraft;
  holdForEntry?: typeof holdForEntry;
}

/// Puts one file where the person said. Returns the lines they see, and
/// whether the file was taken.
export async function putSentFile(
  address: string,
  purpose: SentPurpose,
  file: SentFile,
  deps: Omit<UseSentDeps, 'store' | 'now'>,
): Promise<{ used: boolean; lines: string[] }> {
  if ((purpose === 'offer' || purpose === 'delivery') && !file.mimeType.startsWith('image/')) {
    return { used: false, lines: [`A PDF can't go on ${purpose === 'offer' ? 'an offer' : 'a delivery'}, only photos.`] };
  }
  const lines =
    purpose === 'offer'
      ? [await (deps.holdForOffer ?? holdForOffer)(address, file)]
      : purpose === 'delivery'
        ? [await (deps.holdForDelivery ?? holdForDelivery)(address, file)]
        : purpose === 'request'
          ? [await (deps.holdForDraft ?? holdForDraft)(address, file)]
          : purpose === 'entry'
            ? [await (deps.holdForEntry ?? holdForEntry)(address, file)]
            : await deps.readInvoice(address, file);
  return { used: true, lines };
}

/// Puts every held file where the person said. Returns what happened, in the
/// words the person sees.
export async function useSentFiles(address: string, purpose: SentPurpose, deps: UseSentDeps): Promise<{ ok: boolean; said: string }> {
  const files = deps.store.take(address, deps.now());
  if (!files.length) return { ok: false, said: 'No sent file is waiting: it was used already or is over an hour old. Ask them to send it again.' };
  const lines: string[] = [];
  let used = 0;
  for (const file of files) {
    const one = await putSentFile(address, purpose, file, deps);
    if (one.used) used += 1;
    lines.push(...one.lines);
  }
  return { ok: used > 0, said: lines.join('\n') };
}

/// The live invoice reader, the same one a chat-app file used before view 66.
/// Loaded on first use so importing this file never opens a model.
export async function readInvoiceLive(address: string, file: SentFile, channel: 'telegram' | 'whatsapp' | 'web' = 'web'): Promise<string[]> {
  const [{ createEvidenceIntake }, { extractInvoice }, { getProfile }, { claimUnique }, { addVerifiedFact }] = await Promise.all([
    import('./media.js'),
    import('./invoiceExtract.js'),
    import('../db/profiles.js'),
    import('../db/evidence.js'),
    import('../verification/live.js'),
  ]);
  const intake = createEvidenceIntake({
    now: Date.now,
    channel,
    download: async () => file,
    extract: extractInvoice,
    displayNameOf: async (a) => (await getProfile(a))?.displayName ?? '',
    claimFingerprint: (fp, a) => claimUnique('fp', fp, a),
    addFact: addVerifiedFact,
  });
  const out = await intake(address, { id: channel, from: address, timestamp: Date.now(), kind: 'media', mediaId: 'held', mimeType: file.mimeType });
  return out.map((m) => ('body' in m ? m.body : ''));
}
