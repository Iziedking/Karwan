import { createHmac, timingSafeEqual } from 'node:crypto';

/// Meta signs every webhook body with the app secret. The raw bytes are what
/// is signed, so callers must pass the body exactly as received.
export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
