/// A contest entry's work (view 40): up to four files, checked by their bytes
/// and kept as files under data/, which the backup already covers. The buyer
/// sees one preview until they pay the winners; the full files go only to the
/// entrant, and to the buyer once that entry has won.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { concat, keccak256, toBytes, type Hex } from 'viem';
import { photoStore, sniffPhoto } from '../listings/photos.js';

export const MAX_ENTRY_FILES = 4;
export const MAX_ENTRY_FILE_BYTES = 5_000_000;
const HELD_FOR_MS = 60 * 60_000;

export type EntryFileType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export interface EntryFile {
  bytes: Uint8Array;
  contentType: EntryFileType;
}

const EXT: Record<EntryFileType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const BY_EXT: Record<string, EntryFileType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/// What a file really is, read from its first bytes.
function sniffEntry(bytes: Uint8Array): EntryFileType | null {
  const image = sniffPhoto(bytes);
  if (image) return image;
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  return null;
}

export function checkEntryFile(bytes: Uint8Array): EntryFile | { error: string } {
  if (bytes.length > MAX_ENTRY_FILE_BYTES) return { error: 'That file is too large. Use one under 5 MB.' };
  const contentType = sniffEntry(bytes);
  if (!contentType) return { error: 'Entries take images (JPEG, PNG, WebP) and PDF files.' };
  return { bytes, contentType };
}

/// What goes on chain for an entry: its files in order and its note, so the
/// entry the buyer pays for is the one that was entered.
export function entryFingerprint(files: Uint8Array[], note: string): Hex {
  const parts = files.map((f) => createHash('sha256').update(f).digest());
  return keccak256(concat([...parts.map((p) => new Uint8Array(p)), toBytes(note)]));
}

export function entryFileStore(root: string = resolve(process.cwd(), 'data', 'contest-entries')) {
  const entryDir = (id: string) => join(root, 'entries', id);
  const heldDir = (address: string) => join(root, 'held', address.toLowerCase());
  const list = (dir: string) => (existsSync(dir) ? readdirSync(dir).sort() : []);

  function heldNames(address: string, now: number): string[] {
    if (!/^0x[a-f0-9]{40}$/i.test(address)) return [];
    const keep: string[] = [];
    for (const name of list(heldDir(address))) {
      const at = Number(name.split('-')[0]);
      if (!Number.isFinite(at) || now - at > HELD_FOR_MS) rmSync(join(heldDir(address), name), { force: true });
      else keep.push(name);
    }
    return keep;
  }

  return {
    saveFiles(entryId: string, files: EntryFile[]): void {
      if (!SAFE_ID.test(entryId)) throw new Error('bad entry id');
      if (files.length === 0 || files.length > MAX_ENTRY_FILES) throw new Error(`one to ${MAX_ENTRY_FILES} files`);
      const dir = entryDir(entryId);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      files.forEach((f, i) => writeFileSync(join(dir, `${i}.${EXT[f.contentType]}`), f.bytes));
    },

    readFile(entryId: string, n: number): EntryFile | null {
      if (!SAFE_ID.test(entryId) || !Number.isInteger(n) || n < 0 || n >= MAX_ENTRY_FILES) return null;
      const name = list(entryDir(entryId)).find((f) => f.startsWith(`${n}.`));
      const contentType = name ? BY_EXT[name.split('.')[1] ?? ''] : undefined;
      return name && contentType ? { bytes: new Uint8Array(readFileSync(join(entryDir(entryId), name))), contentType } : null;
    },

    count(entryId: string): number {
      return SAFE_ID.test(entryId) ? list(entryDir(entryId)).length : 0;
    },

    /// A file sent to the assistant for the person's next entry, kept an hour.
    hold(address: string, file: EntryFile, now: number): { held: number } | { error: string } {
      if (!/^0x[a-f0-9]{40}$/i.test(address)) return { error: 'No account to hold the file for.' };
      const held = heldNames(address, now);
      if (held.length >= MAX_ENTRY_FILES) return { error: `An entry takes ${MAX_ENTRY_FILES} files at most.` };
      mkdirSync(heldDir(address), { recursive: true });
      writeFileSync(join(heldDir(address), `${now}-${randomBytes(4).toString('hex')}.${EXT[file.contentType]}`), file.bytes);
      return { held: held.length + 1 };
    },

    heldCount(address: string, now: number): number {
      return heldNames(address, now).length;
    },

    takeHeld(address: string, now: number): EntryFile[] {
      const out: EntryFile[] = [];
      for (const name of heldNames(address, now)) {
        const contentType = BY_EXT[name.split('.').pop() ?? ''];
        if (contentType) out.push({ bytes: new Uint8Array(readFileSync(join(heldDir(address), name))), contentType });
        rmSync(join(heldDir(address), name), { force: true });
      }
      return out;
    },
  };
}

/// A file sent in chat goes to the next contest entry only when its caption
/// says so ("my entry", "for the contest").
export function isEntryCaption(caption: string | undefined): boolean {
  if (!caption) return false;
  return /\b(?:my entry|entry for|for the contest|contest entry|enter (?:the|this) contest)\b/i.test(caption);
}

/// A file sent to the assistant for a contest entry, from the website or a
/// chat app. Returns the line the assistant replies with.
export async function holdForEntry(
  address: string,
  file: { bytes: Uint8Array; mimeType: string },
  now: number = Date.now(),
  store: ReturnType<typeof entryFileStore> = entryFiles,
): Promise<string> {
  const checked = checkEntryFile(file.bytes);
  if ('error' in checked) return checked.error;
  const held = store.hold(address, checked, now);
  if ('error' in held) return held.error;
  return held.held === 1
    ? `Kept for your entry (1 of ${MAX_ENTRY_FILES}). Send more, or tell me which contest to enter.`
    : `Kept (${held.held} of ${MAX_ENTRY_FILES}).`;
}

/// The stores the app uses: full files, and one preview image per entry.
export const entryFiles = entryFileStore();
export const entryPreviews = photoStore(resolve(process.cwd(), 'data', 'contest-previews'));
