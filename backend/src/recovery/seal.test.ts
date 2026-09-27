import assert from 'node:assert/strict';
import test from 'node:test';
import { devSealer, kmsSealer } from './seal.js';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const bytes = new TextEncoder().encode('locked-copy');

test('a sealed value opens only for the same wallet and purpose', async () => {
  const s = devSealer(new Uint8Array(32).fill(7));
  const sealed = await s.seal(bytes, { walletAddress: A, purpose: 'blob' });
  assert.deepEqual(await s.open(sealed, { walletAddress: A, purpose: 'blob' }), bytes);
  await assert.rejects(() => s.open(sealed, { walletAddress: B, purpose: 'blob' }));
  await assert.rejects(() => s.open(sealed, { walletAddress: A, purpose: 'verifier' }));
});

test('a tampered sealed value is refused', async () => {
  const s = devSealer(new Uint8Array(32).fill(7));
  const sealed = await s.seal(bytes, { walletAddress: A, purpose: 'blob' });
  sealed[sealed.length - 1] ^= 1;
  await assert.rejects(() => s.open(sealed, { walletAddress: A, purpose: 'blob' }));
});

test('KMS sealing binds the wallet, purpose and app as encryption context', async () => {
  const seen: Array<{ op: string; ctx: Record<string, string> }> = [];
  const client = {
    async send(cmd: { constructor: { name: string }; input: { EncryptionContext: Record<string, string>; Plaintext?: Uint8Array; CiphertextBlob?: Uint8Array } }) {
      seen.push({ op: cmd.constructor.name, ctx: cmd.input.EncryptionContext });
      return cmd.constructor.name === 'EncryptCommand' ? { CiphertextBlob: cmd.input.Plaintext } : { Plaintext: cmd.input.CiphertextBlob };
    },
  };
  const s = kmsSealer({ keyId: 'alias/karwan-recovery', region: 'ca-central-1', client });
  const sealed = await s.seal(bytes, { walletAddress: A.replace('0x1', '0x1'), purpose: 'blob' });
  await s.open(sealed, { walletAddress: A, purpose: 'blob' });
  const ctx = { wallet: A, purpose: 'blob', app: 'karwan-recovery-v1' };
  assert.deepEqual(seen, [{ op: 'EncryptCommand', ctx }, { op: 'DecryptCommand', ctx }]);
});
