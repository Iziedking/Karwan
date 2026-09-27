import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { config } from '../config.js';

/// The server's lock on a recovery backup, on top of the browser's password
/// lock. Every value is bound to one wallet and one purpose, so a copied row
/// cannot be opened as another wallet's backup.
export type SealContext = { walletAddress: string; purpose: 'blob' | 'verifier' };
export interface Sealer {
  seal(plain: Uint8Array, ctx: SealContext): Promise<Uint8Array>;
  open(sealed: Uint8Array, ctx: SealContext): Promise<Uint8Array>;
}
export interface KMSClientLike {
  send(cmd: unknown): Promise<{ CiphertextBlob?: Uint8Array; Plaintext?: Uint8Array }>;
}

function context(ctx: SealContext): Record<string, string> {
  return { wallet: ctx.walletAddress.toLowerCase(), purpose: ctx.purpose, app: 'karwan-recovery-v1' };
}

/// Local and test runs only. The key lives in process memory, so a restart
/// loses every sealed value; mainnet production refuses to start without KMS.
export function devSealer(key: Uint8Array = randomBytes(32)): Sealer {
  const aad = (ctx: SealContext) => Buffer.from(JSON.stringify(context(ctx)));
  return {
    async seal(plain, ctx) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      c.setAAD(aad(ctx));
      const body = Buffer.concat([c.update(plain), c.final()]);
      return new Uint8Array(Buffer.concat([iv, c.getAuthTag(), body]));
    },
    async open(sealed, ctx) {
      const buf = Buffer.from(sealed);
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAAD(aad(ctx));
      d.setAuthTag(buf.subarray(12, 28));
      return new Uint8Array(Buffer.concat([d.update(buf.subarray(28)), d.final()]));
    },
  };
}

export function kmsSealer(opts: { keyId: string; region: string; client?: KMSClientLike }): Sealer {
  const client = opts.client ?? (new KMSClient({ region: opts.region }) as unknown as KMSClientLike);
  return {
    async seal(plain, ctx) {
      const out = await client.send(new EncryptCommand({ KeyId: opts.keyId, Plaintext: plain, EncryptionContext: context(ctx) }));
      if (!out.CiphertextBlob) throw new Error('kms returned no ciphertext');
      return out.CiphertextBlob;
    },
    async open(sealed, ctx) {
      const out = await client.send(new DecryptCommand({ KeyId: opts.keyId, CiphertextBlob: sealed, EncryptionContext: context(ctx) }));
      if (!out.Plaintext) throw new Error('kms returned no plaintext');
      return out.Plaintext;
    },
  };
}

let cached: Sealer | null = null;
export function sealer(): Sealer {
  cached ??= config.RECOVERY_KMS_KEY_ID
    ? kmsSealer({ keyId: config.RECOVERY_KMS_KEY_ID, region: config.AWS_REGION ?? 'ca-central-1' })
    : devSealer();
  return cached;
}
