import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCircleBridgeSource } from './bridgeSource.js';

const wallets = {
  userAddress: '0x1111111111111111111111111111111111111111',
  buyerWalletId: 'buyer-wallet',
  buyerAddress: '0x2222222222222222222222222222222222222222',
  sellerWalletId: 'seller-wallet',
  sellerAddress: '0x3333333333333333333333333333333333333333',
  createdAt: 1,
  bridgeWallets: { 'ARB-SEPOLIA': { walletId: 'identity-arb', address: '0x4444444444444444444444444444444444444444' } },
};

test('resolves buyer agent as the source and same agent as Arc recipient', () => {
  assert.deepEqual(resolveCircleBridgeSource(wallets, 'buyerAgent', 'ARB-SEPOLIA', wallets.buyerAddress), {
    walletId: 'buyer-wallet', address: wallets.buyerAddress, mintRecipient: wallets.buyerAddress,
  });
});

test('rejects routing an agent bridge to an unrelated recipient', () => {
  assert.throws(() => resolveCircleBridgeSource(wallets, 'buyerAgent', 'ARB-SEPOLIA', wallets.userAddress), /same agent wallet/);
});

test('resolves identity source from its chain deposit wallet', () => {
  assert.equal(resolveCircleBridgeSource(wallets, 'identity', 'ARB-SEPOLIA', wallets.userAddress).walletId, 'identity-arb');
});
