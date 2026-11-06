/// Photos and PDFs attached to a request or a direct deal (view 56, "Say it").
/// Read by their first bytes, kept under a random folder per set in data/
/// (the backup already covers it), and served one at a time to the people who
/// can read the request or the deal.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MAX_PHOTO_BYTES, sniffPhoto, type PhotoType } from '../listings/photos.js';

export const MAX_ATTACHMENTS = 4;
export const MAX_PDF_BYTES = 4_000_000;
export const MAX_ATTACHMENT_TOTAL_BYTES = 6_000_000;

export type AttachmentType = PhotoType | 'application/pdf';
export interface Attachment {
  bytes: Uint8Array;
  contentType: AttachmentType;
  name: string;
}
export interface AttachmentMeta {
  contentType: AttachmentType;
  size: number;
  name: string;
  at: number;
}
export interface AttachmentSet {
  folder: string;
  items: AttachmentMeta[];
}

const EXT: Record<AttachmentType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const BY_EXT: Record<string, AttachmentType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
const FOLDER = /^att_[a-f0-9]{16}$/;
const ADDRESS = /^0x[a-f0-9]{40}$/i;
const HELD_FOR_MS = 60 * 60_000;

function sniff(bytes: Uint8Array): AttachmentType | null {
  const photo = sniffPhoto(bytes);
  if (photo) return photo;
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-' ? 'application/pdf' : null;
}

/// A plain file name to show and to download as: no folders, no quotes or
/// control characters, at most 80 characters, ending in the type it really is.
export function safeName(raw: string, type: AttachmentType): string {
  const base = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f"<>|*?:]/g, '').replace(/\s+/g, ' ').trim();
  const ext = EXT[type];
  const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 72).trim();
  return `${stem || (type === 'application/pdf' ? 'file' : 'photo')}.${ext}`;
}

/// One file checked by its bytes: a photo up to 1.5 MB, a PDF up to 4 MB.
export function checkAttachment(bytes: Uint8Array, name: string): Attachment | { error: string } {
  const contentType = sniff(bytes);
  if (!contentType) return { error: 'Add a photo or a PDF.' };
  const limit = contentType === 'application/pdf' ? MAX_PDF_BYTES : MAX_PHOTO_BYTES;
  if (bytes.length > limit) return { error: 'That file is too large.' };
  return { bytes, contentType, name: safeName(name, contentType) };
}

/// The form's files and the ones held from the assistant, under the same limits.
export function joinAttachments(form: Attachment[], held: Attachment[]): Attachment[] | { error: string } {
  const all = [...form, ...held];
  if (all.length > MAX_ATTACHMENTS) return { error: `Up to ${MAX_ATTACHMENTS} photos or PDFs.` };
  if (all.reduce((sum, a) => sum + a.bytes.length, 0) > MAX_ATTACHMENT_TOTAL_BYTES) return { error: 'Those files are too large together. Use 6 MB at most.' };
  return all;
}

/// The attachments from a form, each a data URL with its file name.
export function decodeAttachments(input: ReadonlyArray<{ name: string; dataUrl: string }>): Attachment[] | { error: string } {
  if (input.length > MAX_ATTACHMENTS) return { error: `Up to ${MAX_ATTACHMENTS} photos or PDFs.` };
  const out: Attachment[] = [];
  let total = 0;
  for (const item of input) {
    const match = /^data:[a-z]+\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(item.dataUrl);
    if (!match) return { error: 'Add a photo or a PDF.' };
    const checked = checkAttachment(new Uint8Array(Buffer.from(match[1]!, 'base64')), item.name);
    if ('error' in checked) return checked;
    const { bytes, contentType } = checked;
    total += bytes.length;
    if (total > MAX_ATTACHMENT_TOTAL_BYTES) return { error: 'Those files are too large together. Use 6 MB at most.' };
    out.push({ bytes, contentType, name: checked.name });
  }
  return out;
}

export function attachmentStore(root: string) {
  const dir = (folder: string) => join(root, folder);
  const heldDir = (address: string) => join(root, 'held', address.toLowerCase());

  function heldNames(address: string, now: number): string[] {
    if (!ADDRESS.test(address) || !existsSync(heldDir(address))) return [];
    const keep: string[] = [];
    for (const name of readdirSync(heldDir(address)).sort()) {
      const at = Number(name.split('-')[0]);
      if (!Number.isFinite(at) || now - at > HELD_FOR_MS) rmSync(join(heldDir(address), name), { force: true });
      else keep.push(name);
    }
    return keep;
  }

  return {
    /// A file sent to the assistant for the person's next request or deal, held an hour.
    hold(address: string, item: Attachment, now: number): { held: number } | { error: string } {
      if (!ADDRESS.test(address)) return { error: 'No account to hold the file for.' };
      const held = heldNames(address, now);
      if (held.length >= MAX_ATTACHMENTS) return { error: `A request or a deal takes ${MAX_ATTACHMENTS} photos or PDFs at most. Post it, or start again.` };
      const size = held.reduce((sum, name) => sum + statSync(join(heldDir(address), name)).size, 0);
      if (size + item.bytes.length > MAX_ATTACHMENT_TOTAL_BYTES) return { error: 'Those files are too large together. Use 6 MB at most.' };
      mkdirSync(heldDir(address), { recursive: true });
      writeFileSync(join(heldDir(address), `${now}-${randomBytes(4).toString('hex')}.${EXT[item.contentType]}`), item.bytes);
      return { held: held.length + 1 };
    },

    heldCount(address: string, now: number): number {
      return heldNames(address, now).length;
    },

    /// The held files, oldest first, removed from the hold.
    takeHeld(address: string, now: number): Attachment[] {
      const out: Attachment[] = [];
      let photos = 0;
      let files = 0;
      for (const name of heldNames(address, now)) {
        const contentType = BY_EXT[name.split('.').pop() ?? ''];
        const path = join(heldDir(address), name);
        if (contentType) {
          const pdf = contentType === 'application/pdf';
          const n = pdf ? ++files : ++photos;
          out.push({ bytes: new Uint8Array(readFileSync(path)), contentType, name: `${pdf ? 'file' : 'photo'}-${n}.${EXT[contentType]}` });
        }
        rmSync(path, { force: true });
      }
      return out;
    },

    save(items: Attachment[], now: number): AttachmentSet {
      const folder = `att_${randomBytes(8).toString('hex')}`;
      mkdirSync(dir(folder), { recursive: true });
      return {
        folder,
        items: items.map((item, i) => {
          writeFileSync(join(dir(folder), `${i}.${EXT[item.contentType]}`), item.bytes);
          return { contentType: item.contentType, size: item.bytes.length, name: item.name, at: now };
        }),
      };
    },

    read(folder: string, n: number): { bytes: Uint8Array; contentType: AttachmentType } | null {
      if (!FOLDER.test(folder) || !Number.isInteger(n) || n < 0 || n >= MAX_ATTACHMENTS || !existsSync(dir(folder))) return null;
      const name = readdirSync(dir(folder)).find((f) => f.startsWith(`${n}.`));
      const contentType = name ? BY_EXT[name.split('.')[1] ?? ''] : undefined;
      return name && contentType ? { bytes: new Uint8Array(readFileSync(join(dir(folder), name))), contentType } : null;
    },
  };
}

export const requestAttachments = attachmentStore(resolve(process.cwd(), 'data', 'request-attachments'));
export const dealAttachments = attachmentStore(resolve(process.cwd(), 'data', 'deal-attachments'));

/// The body schema both routes take: up to four data URLs with their names.
export const ATTACHMENT_DATA_URL_MAX = 5_400_000;

/// Headers for serving one attachment inline, never sniffed as something else.
export function attachmentHeaders(meta: AttachmentMeta): Record<string, string> {
  return {
    'content-type': meta.contentType,
    'content-disposition': `inline; filename="${meta.name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=3600',
    ...(meta.contentType === 'application/pdf' ? { 'content-security-policy': "default-src 'none'; sandbox" } : {}),
  };
}

/// What a page is told about a set: names and types in order, never the folder.
export function attachmentList(set: AttachmentSet | undefined): Array<{ name: string; contentType: AttachmentType }> {
  return (set?.items ?? []).map((item) => ({ name: item.name, contentType: item.contentType }));
}

/// Words sent with a file that make it part of the next request or deal (view
/// 56). An invoice or a receipt is never one: those are read for the record.
export function isDraftCaption(caption: string | undefined): boolean {
  if (!caption || /\b(?:invoices?|receipts?)\b/i.test(caption)) return false;
  return /\b(?:requests?|need|looking for|want to buy|deal|agreed|agreement|quote)\b/i.test(caption);
}

/// A photo or PDF sent to the assistant for the person's next request or deal,
/// from the website or a chat app. Returns the line the assistant replies with.
export async function holdForDraft(
  address: string,
  file: { bytes: Uint8Array; mimeType: string },
  now: number = Date.now(),
  store: ReturnType<typeof attachmentStore> = requestAttachments,
): Promise<string> {
  const item = checkAttachment(file.bytes, '');
  if ('error' in item) return item.error === 'Add a photo or a PDF.' ? 'Send a photo or a PDF.' : 'That file is too large. A photo can be 1.5 MB and a PDF 4 MB.';
  const held = store.hold(address, item, now);
  if ('error' in held) return held.error;
  return held.held === 1
    ? `Added to your next request or deal (1 of ${MAX_ATTACHMENTS}). Tell me what you need, or who the deal is with.`
    : `Added (${held.held} of ${MAX_ATTACHMENTS}).`;
}
