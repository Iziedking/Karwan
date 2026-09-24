export function isValidProfileImage(dataUrl: string): boolean {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return false;
  const encoded = match[1];
  if (!encoded || encoded.length % 4 !== 0) return false;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length > 0 && bytes.length <= 80_000 &&
    bytes.toString('base64') === encoded &&
    bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}
