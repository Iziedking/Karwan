import { describe, expect, test } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverSigner } from './recover.js';

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

describe('sync signer recovery', () => {
  test('recovers the wallet that signed a personal message', async () => {
    const signature = await account.signMessage({ message: 'karwan work proof' });
    expect(recoverSigner('karwan work proof', signature)?.toLowerCase()).toBe(account.address.toLowerCase());
  });

  test('another message recovers another address, and junk recovers none', async () => {
    const signature = await account.signMessage({ message: 'karwan work proof' });
    expect(recoverSigner('karwan work proof!', signature)?.toLowerCase()).not.toBe(account.address.toLowerCase());
    expect(recoverSigner('karwan work proof', `0x${'00'.repeat(65)}`)).toBeNull();
  });
});
