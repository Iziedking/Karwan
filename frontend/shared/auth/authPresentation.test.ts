import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionMatchesWallet, shouldWaitForWalletSession } from './authPresentation';

const wallet = { connected: true, address: '0x1111111111111111111111111111111111111111' };
const idleSiwe = { phase: 'idle' as const, address: null, error: null };

test('a connected wallet without a session holds private route gates', () => {
  assert.equal(
    shouldWaitForWalletSession({
      isPublicRoute: false,
      walletAddress: wallet.address,
      walletConnected: wallet.connected,
      session: null,
      siwe: idleSiwe,
    }),
    true,
  );
});

test('public routes do not force a wallet signature', () => {
  assert.equal(
    shouldWaitForWalletSession({
      isPublicRoute: true,
      walletAddress: wallet.address,
      walletConnected: wallet.connected,
      session: null,
      siwe: idleSiwe,
    }),
    false,
  );
});

test('a failed proof releases the gate so the user can retry', () => {
  assert.equal(
    shouldWaitForWalletSession({
      isPublicRoute: false,
      walletAddress: wallet.address,
      walletConnected: wallet.connected,
      session: null,
      siwe: { phase: 'error', address: wallet.address.toUpperCase(), error: 'cancelled' },
    }),
    false,
  );
});

test('web3 sessions must match the connected wallet while Circle sessions remain independent', () => {
  assert.equal(
    sessionMatchesWallet(
      { address: wallet.address, method: 'web3' },
      wallet,
    ),
    true,
  );
  assert.equal(
    sessionMatchesWallet(
      { address: '0x2222222222222222222222222222222222222222', method: 'web3' },
      wallet,
    ),
    false,
  );
  assert.equal(
    sessionMatchesWallet(
      { address: '0x3333333333333333333333333333333333333333', method: 'circle' },
      wallet,
    ),
    true,
  );
});
