/// A profile photo is stored as a data URL. Public reads send a link to it
/// instead, so a list of people does not carry every photo inline, and the
/// browser caches the image between pages.

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export function decodePhoto(dataUrl: string | undefined): { contentType: string; bytes: Buffer } | null {
  const match = dataUrl ? DATA_URL.exec(dataUrl) : null;
  if (!match) return null;
  return { contentType: match[1]!, bytes: Buffer.from(match[2]!, 'base64') };
}

/// The version changes whenever the profile does, so a new photo is never
/// served from an old cache.
export function photoPath(address: string, updatedAt: number): string {
  return `/api/profile/photo/${address.toLowerCase()}?v=${updatedAt}`;
}
