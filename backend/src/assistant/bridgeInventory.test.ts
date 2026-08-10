import assert from 'node:assert/strict';
import test from 'node:test';
import { bridgeSourceHolders } from './bridgeInventory.js';

const record = {
  userAddress: '0x1111111111111111111111111111111111111111',
  buyerWalletId: 'buyer',
  buyerAddress: '0x2222222222222222222222222222222222222222',
  sellerWalletId: 'seller',
  sellerAddress: '0x3333333333333333333333333333333333333333',
  createdAt: 1,
  bridgeWallets: { 'ARB-SEPOLIA': { walletId: 'deposit', address: '0x4444444444444444444444444444444444444444' } },
};

test('web3 inventory includes both backend-signed agent wallets on external chains', () => {
  const result = bridgeSourceHolders('web3', record.userAddress, record, 'ARB-SEPOLIA');
  assert.equal(result.accountType, 'web3');
  assert.equal(result.main.address, record.userAddress);
  assert.equal(result.main.signer, 'user');
  assert.equal(result.buyerAgent.address, record.buyerAddress);
  assert.equal(result.buyerAgent.signer, 'backend');
  assert.equal(result.sellerAgent.address, record.sellerAddress);
});

test('circle inventory distinguishes the identity deposit wallet from agent wallets', () => {
  const result = bridgeSourceHolders('circle', record.userAddress, record, 'ARB-SEPOLIA');
  assert.equal(result.accountType, 'email/passkey');
  assert.equal(result.main.address, record.bridgeWallets['ARB-SEPOLIA'].address);
  assert.equal(result.main.signer, 'backend');
  assert.equal(result.buyerAgent.address, record.buyerAddress);
});
