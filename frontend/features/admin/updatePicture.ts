/// Rules for a Home Updates picture on /admin/updates. The tile shows it at
/// about 16:9 and trims the rest.

const MAX_PICTURE_BYTES = 4_000_000;

export function pictureTooLarge(bytes: number): string | null {
  return bytes > MAX_PICTURE_BYTES
    ? 'That picture is too large. Use one under 4 MB; a 1600x900 WebP is usually under 300 KB.'
    : null;
}

export function pictureNote(width: number, height: number): { fits: boolean; text: string } {
  const fits = Math.abs(width / height - 16 / 9) < 0.05;
  const rest = fits ? ' Fits the tile.' : ' Not 16:9, so the tile trims it. Check the preview, or ask for 1600x900.';
  return { fits, text: `Uploaded, ${width}x${height}.${rest}` };
}
