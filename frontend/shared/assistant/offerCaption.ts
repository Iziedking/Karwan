/// Whether the words sent with a photo say it is for an offer ("selling this",
/// "for my offer"). The same rule the backend applies to a photo sent on
/// Telegram (backend/src/listings/photos.ts isOfferPhotoCaption), so a photo
/// means the same thing on every channel.
export function isOfferCaption(caption: string): boolean {
  return /\b(?:offers?|listings?|selling|for sale|sell this|to sell)\b/i.test(caption);
}

/// Whether the words sent with a photo or PDF make it part of the next request
/// or deal (view 56). The same rule as the backend's isDraftCaption
/// (backend/src/attachments/attachments.ts); an invoice or a receipt never is.
export function isDraftCaption(caption: string): boolean {
  if (!caption || /\b(?:invoices?|receipts?)\b/i.test(caption)) return false;
  return /\b(?:requests?|need|looking for|want to buy|deal|agreed|agreement|quote)\b/i.test(caption);
}
