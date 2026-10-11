import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sessionMatchesWallet,
  shouldWaitForWalletSession,
  walletStillResolving,
  walletWasDisconnected,
  WALLET_RESOLVE_CAP_MS,
} from './authPresentation';

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

test('a wallet that never answers stops holding the page after the cap', () => {
  assert.equal(walletStillResolving('reconnecting', 0), true);
  assert.equal(walletStillResolving('connecting', WALLET_RESOLVE_CAP_MS - 1), true);
  assert.equal(walletStillResolving('reconnecting', WALLET_RESOLVE_CAP_MS), false);
  assert.equal(walletStillResolving('disconnected', 0), false);
  assert.equal(walletStillResolving('connected', 0), false);
});

test('a web3 session stays signed in while its wallet is locked, absent or still reconnecting', () => {
  const session = { address: wallet.address, method: 'web3' as const };
  assert.equal(sessionMatchesWallet(session, { connected: false }), true);
  assert.equal(sessionMatchesWallet(session, { connected: false, address: wallet.address }), true);
});

test('only a wallet that was connected in this tab and then disconnected signs the session out', () => {
  assert.equal(walletWasDisconnected('connected', 'disconnected'), true);
  assert.equal(walletWasDisconnected('reconnecting', 'disconnected'), false);
  assert.equal(walletWasDisconnected('connecting', 'disconnected'), false);
  assert.equal(walletWasDisconnected(null, 'disconnected'), false);
  assert.equal(walletWasDisconnected('connected', 'connected'), false);
});

test('a returning wallet holds the page for two seconds at most', () => {
  assert.equal(WALLET_RESOLVE_CAP_MS <= 2_000, true);
  assert.equal(walletStillResolving('reconnecting', 2_100), false);
});
