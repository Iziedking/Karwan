import { ApiError } from '@/core/api';

/// Photos on an offer (docs/architecture/28-photos-on-listings.md). The offer
/// routes take them as data URLs, resized here first; the market and the offer
/// page show them from their own links.

export const MAX_OFFER_PHOTOS = 4;
const LONGEST_SIDE = 1280;
const QUALITY = 0.82;

const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || 'http://localhost:8787').replace(/\/+$/, '');

/// A listing as the API returns it, with its photo links.
export type WithPhotos = { photoUrls?: string[] };

/// The full address of a photo link from the API.
export function photoSrc(path: string): string {
  return /^https?:\/\//.test(path) || path.startsWith('data:') ? path : `${BASE}${path}`;
}

/// How many of the picked files still fit beside the photos already chosen.
export function room(current: number, picked: number): number {
  return Math.max(0, Math.min(picked, MAX_OFFER_PHOTOS - current));
}

/// A picked photo, resized on the device to at most 1280px on its longest side
/// and saved as JPEG. Drawing it again also drops the location and camera data
/// the original file carried.
export async function resizePhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('unsupported');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, credentials: 'include', cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new ApiError(res.status, body?.error ?? res.statusText, undefined, undefined, body);
  return body;
}

/// Report an offer or its photos to the team.
export function reportOffer(listingId: string, reason: 'photo' | 'listing', note?: string) {
  return send<{ ok: true }>(`/api/listings/${encodeURIComponent(listingId)}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason, ...(note?.trim() ? { note: note.trim() } : {}) }),
  });
}

/// A photo added in assistant mode for the person's next offer.
export function attachForOffer(file: File) {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'offer');
  return send<{ reply: string }>('/api/assistant/attach', { method: 'POST', body: form });
}
