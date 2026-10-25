/// Whether the words sent with a photo say it is for an offer ("selling this",
/// "for my offer"). The same rule the backend applies to a photo sent on
/// Telegram (backend/src/listings/photos.ts isOfferPhotoCaption), so a photo
/// means the same thing on every channel.
export function isOfferCaption(caption: string): boolean {
  return /\b(?:offers?|listings?|selling|for sale|sell this|to sell)\b/i.test(caption);
}
