import { argon2id } from 'hash-wasm';
import type { Hex } from 'viem';

/// The browser's lock on a recovery key. The password is stretched with
/// Argon2id, then split (HKDF) into an encryption key and a verifier. Only the
/// locked key and the verifier leave the device; the password never does.
export type KdfParams = { alg: 'argon2id'; m: number; t: number; p: 1; salt: string };
export const DEFAULT_KDF: Omit<KdfParams, 'salt'> = { alg: 'argon2id', m: 65536, t: 3, p: 1 };

export class WrongPasswordError extends Error {
  constructor() {
    super('wrong password');
    this.name = 'WrongPasswordError';
  }
}

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};
const aad = (wallet: string) => enc.encode(`${wallet.toLowerCase()}|v1`);
const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) });

async function keys(password: string, kdf: KdfParams) {
  const raw = await argon2id({
    password,
    salt: unb64u(kdf.salt),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary',
  });
  const stretched = new Uint8Array(raw);
  raw.fill(0);
  const base = await crypto.subtle.importKey('raw', stretched, 'HKDF', false, ['deriveBits', 'deriveKey']);
  stretched.fill(0);
  const encKey = await crypto.subtle.deriveKey(hkdf('karwan-recovery-enc-v1'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const verifier = new Uint8Array(await crypto.subtle.deriveBits(hkdf('karwan-recovery-verify-v1'), base, 256));
  return { encKey, verifier };
}

export async function lockRecoveryKey(args: {
  password: string;
  privateKey: Hex;
  walletAddress: string;
  kdf?: Omit<KdfParams, 'salt'>;
}): Promise<{ kdf: KdfParams; iv: string; blob: string; verifier: string }> {
  const kdf: KdfParams = { ...(args.kdf ?? DEFAULT_KDF), salt: b64u(crypto.getRandomValues(new Uint8Array(16))) };
  const { encKey, verifier } = await keys(args.password, kdf);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = Uint8Array.from(args.privateKey.slice(2).match(/../g)!.map((h) => parseInt(h, 16)));
  const blob = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(args.walletAddress) }, encKey, plain));
  plain.fill(0);
  return { kdf, iv: b64u(iv), blob: b64u(blob), verifier: b64u(verifier) };
}

export async function deriveVerifier(password: string, kdf: KdfParams): Promise<string> {
  return b64u((await keys(password, kdf)).verifier);
}

export async function unlockRecoveryKey(args: {
  password: string;
  kdf: KdfParams;
  iv: string;
  blob: string;
  walletAddress: string;
}): Promise<Hex> {
  const { encKey } = await keys(args.password, args.kdf);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(args.iv), additionalData: aad(args.walletAddress) }, encKey, unb64u(args.blob)),
    );
  } catch {
    throw new WrongPasswordError();
  }
  const hex = `0x${Array.from(plain, (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex;
  plain.fill(0);
  return hex;
}
