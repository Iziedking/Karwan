import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/// The mainnet desk's code (view 79): RFC 6238 with HMAC-SHA1, 6 digits and
/// 30 second steps, read from an authenticator app. The secret is kept sealed
/// with a server key, never in the clear.

const STEP_MS = 30_000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newCodeSecret(): Buffer {
  return randomBytes(20);
}

/// RFC 4648 base32 without padding, which is what authenticator apps read.
export function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function otpauthUri(email: string, secret: Buffer): string {
  const label = `${encodeURIComponent('Karwan Desk')}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${base32(secret)}&issuer=${encodeURIComponent('Karwan Desk')}&algorithm=SHA1&digits=6&period=30`;
}

export function totp(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const n = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

function same(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/// The step before and after now are taken, for a phone clock a little off. A
/// step at or before the last one used is refused, so a code works once.
export function checkCode(
  secret: Buffer,
  code: string,
  now: number,
  lastStep?: number,
): { ok: true; step: number } | { ok: false; reason: 'wrong' | 'reused' } {
  const typed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return { ok: false, reason: 'wrong' };
  const current = Math.floor(now / STEP_MS);
  for (const step of [current - 1, current, current + 1]) {
    if (!same(totp(secret, step), typed)) continue;
    if (lastStep !== undefined && step <= lastStep) return { ok: false, reason: 'reused' };
    return { ok: true, step };
  }
  return { ok: false, reason: 'wrong' };
}

function keyOf(key: string): Buffer {
  return createHash('sha256').update(`desk-code:${key}`).digest();
}

/// AES-256-GCM: iv.tag.cipher, each base64url.
export function sealSecret(secret: Buffer, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(key), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function openSecret(sealed: string, key: string): Buffer {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !body) throw new Error('sealed code secret is malformed');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
