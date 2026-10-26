import { resolve } from 'node:path';
import { checkPhoto, photoStore } from '../listings/photos.js';
import { MAX_DELIVERY_PHOTOS } from './deliveryProofRules.js';

/// Photos that go with a delivery (view 33): the packed item, the handover, the
/// finished job. Same checks and storage as offer photos, kept apart under
/// data/delivery-photos and served only to the two sides of the deal.
export const deliveryPhotos = photoStore(resolve(process.cwd(), 'data', 'delivery-photos'));

/// One folder per delivery, so a correction never overwrites what the buyer saw.
export const deliveryPhotoId = (jobId: string, revision: number) => `${jobId.slice(2, 50).toLowerCase()}r${revision}`;

/// A photo sent in a chat app is held for a delivery when its caption says so.
export function isDeliveryPhotoCaption(caption: string | undefined): boolean {
  if (!caption) return false;
  return /\b(?:deliver(?:ed|y)?|proof|handover|handed over|packed|shipped|dispatched)\b/i.test(caption);
}

/// A photo sent to the assistant for the seller's next delivery. Returns the
/// line the assistant replies with.
export async function holdForDelivery(
  address: string,
  file: { bytes: Uint8Array; mimeType: string },
  now: number = Date.now(),
  store: ReturnType<typeof photoStore> = deliveryPhotos,
): Promise<string> {
  const photo = checkPhoto(file.bytes);
  if ('error' in photo) return photo.error;
  const held = store.hold(address, photo, now);
  if ('error' in held) return `A delivery takes ${MAX_DELIVERY_PHOTOS} photos at most. Deliver it, or start again.`;
  return held.held === 1
    ? `Photo added to your delivery (1 of ${MAX_DELIVERY_PHOTOS}). Tell me which deal it is for and the carrier and tracking number, or the buyer's handover code.`
    : `Photo added to your delivery (${held.held} of ${MAX_DELIVERY_PHOTOS}).`;
}
