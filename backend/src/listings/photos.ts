/// Photos on an offer (view 28). Up to four per offer, resized on the device
/// before upload, checked here by their bytes and kept as files under data/,
/// which the backup already covers. Lists never carry the images: each photo
/// is served from its own cached link.
///
/// Photos sent to the assistant on the website or in a chat app are held for
/// the person's next offer for an hour, so the confirm card can add them.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const MAX_OFFER_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 1_500_000;
const HELD_FOR_MS = 60 * 60_000;

export type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp';
export interface ListingPhoto {
  contentType: PhotoType;
  size: number;
  /// When the set was saved; versions the link so caches never serve an old photo.
  at: number;
}
export interface Photo {
  bytes: Uint8Array;
  contentType: PhotoType;
}

const EXT: Record<PhotoType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const BY_EXT: Record<string, PhotoType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/// The type a file really is, read from its first bytes. The type a browser
/// or a data URL claims is never trusted.
export function sniffPhoto(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/// A photo from the offer form, sent as a data URL.
export function decodePhotoDataUrl(dataUrl: string): Photo | { error: string } {
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { error: 'Photos must be JPEG, PNG or WebP.' };
  return checkPhoto(new Uint8Array(Buffer.from(match[1]!, 'base64')));
}

/// The same check for a photo that arrived as raw bytes (the assistant, a chat app).
export function checkPhoto(bytes: Uint8Array): Photo | { error: string } {
  if (bytes.length > MAX_PHOTO_BYTES) return { error: 'That photo is too large. Use one under 1.5 MB.' };
  const contentType = sniffPhoto(bytes);
  if (!contentType) return { error: 'Photos must be JPEG, PNG or WebP.' };
  return { bytes, contentType };
}

/// Links to an offer's photos, in order.
export function photoUrls(listing: { id: string; photos?: ListingPhoto[] }): string[] {
  return (listing.photos ?? []).map((p, i) => `/api/listings/${listing.id}/photos/${i}?v=${p.at}`);
}

/// A photo sent in a chat app goes to the next offer only when its caption
/// says so ("for my offer", "selling this"). Anything else is read as an
/// invoice, as before.
export function isOfferPhotoCaption(caption: string | undefined): boolean {
  if (!caption) return false;
  return /\b(?:offers?|listings?|selling|for sale|sell this|to sell)\b/i.test(caption);
}

export function photoStore(root: string = resolve(process.cwd(), 'data', 'listing-photos')) {
  const offerDir = (id: string) => join(root, 'offers', id);
  const heldDir = (address: string) => join(root, 'held', address.toLowerCase());

  function files(dir: string): string[] {
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  function heldFiles(address: string, now: number): string[] {
    if (!/^0x[a-f0-9]{40}$/i.test(address)) return [];
    const dir = heldDir(address);
    const keep: string[] = [];
    for (const name of files(dir)) {
      const at = Number(name.split('-')[0]);
      if (!Number.isFinite(at) || now - at > HELD_FOR_MS) rmSync(join(dir, name), { force: true });
      else keep.push(name);
    }
    return keep;
  }

  return {
    /// Replaces an offer's photos with these, in order.
    save(listingId: string, photos: Photo[], now: number): ListingPhoto[] {
      if (!SAFE_ID.test(listingId)) throw new Error('bad listing id');
      if (photos.length > MAX_OFFER_PHOTOS) throw new Error(`at most ${MAX_OFFER_PHOTOS} photos`);
      const dir = offerDir(listingId);
      rmSync(dir, { recursive: true, force: true });
      if (!photos.length) return [];
      mkdirSync(dir, { recursive: true });
      return photos.map((p, i) => {
        writeFileSync(join(dir, `${i}.${EXT[p.contentType]}`), p.bytes);
        return { contentType: p.contentType, size: p.bytes.length, at: now };
      });
    },

    read(listingId: string, n: number): Photo | null {
      if (!SAFE_ID.test(listingId) || !Number.isInteger(n) || n < 0 || n >= MAX_OFFER_PHOTOS) return null;
      const name = files(offerDir(listingId)).find((f) => f.startsWith(`${n}.`));
      if (!name) return null;
      const contentType = BY_EXT[name.split('.')[1] ?? ''];
      return contentType ? { bytes: new Uint8Array(readFileSync(join(offerDir(listingId), name))), contentType } : null;
    },

    clear(listingId: string): void {
      if (SAFE_ID.test(listingId)) rmSync(offerDir(listingId), { recursive: true, force: true });
    },

    hold(address: string, photo: Photo, now: number): { held: number } | { error: string } {
      if (!/^0x[a-f0-9]{40}$/i.test(address)) return { error: 'No account to hold the photo for.' };
      const held = heldFiles(address, now);
      if (held.length >= MAX_OFFER_PHOTOS) return { error: `An offer takes ${MAX_OFFER_PHOTOS} photos at most. Post it, or start again.` };
      mkdirSync(heldDir(address), { recursive: true });
      writeFileSync(join(heldDir(address), `${now}-${randomBytes(4).toString('hex')}.${EXT[photo.contentType]}`), photo.bytes);
      return { held: held.length + 1 };
    },

    heldCount(address: string, now: number): number {
      return heldFiles(address, now).length;
    },

    /// The held photos, oldest first, removed from the hold.
    takeHeld(address: string, now: number): Photo[] {
      const dir = heldDir(address);
      const out: Photo[] = [];
      for (const name of heldFiles(address, now)) {
        const contentType = BY_EXT[name.split('.').pop() ?? ''];
        if (contentType) out.push({ bytes: new Uint8Array(readFileSync(join(dir, name))), contentType });
        rmSync(join(dir, name), { force: true });
      }
      return out;
    },
  };
}

/// The store the app uses, under data/listing-photos.
export const offerPhotos = photoStore();

/// A photo sent to the assistant for an offer, from the website or a chat app.
/// Returns the line the assistant replies with.
export async function holdForOffer(
  address: string,
  file: { bytes: Uint8Array; mimeType: string },
  now: number = Date.now(),
  store: ReturnType<typeof photoStore> = offerPhotos,
): Promise<string> {
  const photo = checkPhoto(file.bytes);
  if ('error' in photo) return photo.error;
  const held = store.hold(address, photo, now);
  if ('error' in held) return held.error;
  return held.held === 1
    ? `Photo added for your next offer (1 of ${MAX_OFFER_PHOTOS}). Send more, or tell me what you are selling and the price.`
    : `Photo added (${held.held} of ${MAX_OFFER_PHOTOS}).`;
}
