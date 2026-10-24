/// Pictures uploaded for Home Updates cards from /admin/updates, so a
/// designer's artwork goes live without a code change or a deploy. Each file is
/// checked by its bytes and its size in pixels, named by its content, kept
/// under data/ (which the backup already covers) and served from a link that
/// never changes, so it is cached for a year.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sniffPhoto, type PhotoType } from '../listings/photos.js';

export const MAX_UPDATE_IMAGE_BYTES = 4_000_000;
/// Smaller than this looks soft in the tile on a sharp phone screen.
export const MIN_UPDATE_IMAGE = { width: 960, height: 540 };
export const UPDATE_IMAGE_PATH = '/api/updates/images/';

const EXT: Record<PhotoType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const BY_EXT: Record<string, PhotoType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const FILE = /^([a-f0-9]{24})\.(jpg|png|webp)$/;

export interface UpdateImage {
  bytes: Uint8Array;
  contentType: PhotoType;
  width: number;
  height: number;
}

/// Width and height read from the file's own header.
export function imageSize(bytes: Uint8Array, type: PhotoType): { width: number; height: number } | null {
  const u16be = (i: number) => (bytes[i]! << 8) | bytes[i + 1]!;
  const u16le = (i: number) => bytes[i]! | (bytes[i + 1]! << 8);
  const u24le = (i: number) => bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16);
  if (type === 'image/png') {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'image/webp') {
    if (bytes.length < 30) return null;
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const [b0, b1, b2, b3] = [bytes[21]!, bytes[22]!, bytes[23]!, bytes[24]!];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { width: 1 + u24le(24), height: 1 + u24le(27) };
    return null;
  }
  // JPEG: walk the segments to the frame header.
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: u16be(i + 7), height: u16be(i + 5) };
    }
    i += 2 + u16be(i + 2);
  }
  return null;
}

export function checkUpdateImage(bytes: Uint8Array): UpdateImage | { error: string } {
  if (bytes.length > MAX_UPDATE_IMAGE_BYTES) return { error: 'That picture is too large. Use one under 4 MB; a 1600x900 WebP is usually under 300 KB.' };
  const contentType = sniffPhoto(bytes);
  if (!contentType) return { error: 'Pictures must be JPEG, PNG or WebP.' };
  const size = imageSize(bytes, contentType);
  if (!size) return { error: 'That picture could not be read. Export it again as JPEG, PNG or WebP.' };
  if (size.width < MIN_UPDATE_IMAGE.width || size.height < MIN_UPDATE_IMAGE.height) {
    return { error: `That picture is ${size.width}x${size.height}. Use at least ${MIN_UPDATE_IMAGE.width}x${MIN_UPDATE_IMAGE.height}; 1600x900 fits the tile exactly.` };
  }
  return { bytes, contentType, ...size };
}

export function decodeUpdateImage(dataUrl: string): UpdateImage | { error: string } {
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { error: 'Pictures must be JPEG, PNG or WebP.' };
  return checkUpdateImage(new Uint8Array(Buffer.from(match[1]!, 'base64')));
}

export function updateImageStore(root: string = resolve(process.cwd(), 'data', 'update-images')) {
  return {
    /// Saves the picture and returns the path a card's image field takes. The
    /// same file uploaded twice is stored once.
    save(image: UpdateImage): string {
      const name = `${createHash('sha256').update(image.bytes).digest('hex').slice(0, 24)}.${EXT[image.contentType]}`;
      mkdirSync(root, { recursive: true });
      const file = join(root, name);
      if (!existsSync(file)) writeFileSync(file, image.bytes);
      return `${UPDATE_IMAGE_PATH}${name}`;
    },

    read(name: string): { bytes: Uint8Array; contentType: PhotoType } | null {
      const match = FILE.exec(name);
      if (!match) return null;
      const file = join(root, name);
      if (!existsSync(file)) return null;
      return { bytes: new Uint8Array(readFileSync(file)), contentType: BY_EXT[match[2]!]! };
    },
  };
}

export const updateImages = updateImageStore();
