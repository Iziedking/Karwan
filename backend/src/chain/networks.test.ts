import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveArcNetwork } from './networks.js';

test('an unset network is testnet with the endpoints the backend has always used', () => {
  const n = resolveArcNetwork({ ARC_NETWORK: 'testnet' });
  assert.equal(n.chainId, 5042002);
  assert.deepEqual(n.rpcUrls, ['https://rpc.testnet.arc.network']);
  assert.equal(n.explorer, 'https://testnet.arcscan.app');
  assert.equal(n.circleBlockchain, 'ARC-TESTNET');
  assert.equal(n.caip2, 'eip155:5042002');
});

test('testnet still honours the ARC_TESTNET_* variables, deduped in order', () => {
  const n = resolveArcNetwork({
    ARC_NETWORK: 'testnet',
    ARC_TESTNET_RPC_URL: 'https://primary.example',
    ARC_TESTNET_RPC_URLS: 'https://backup.example, https://primary.example',
  });
  assert.deepEqual(n.rpcUrls, ['https://primary.example', 'https://backup.example']);
});

test('mainnet never falls back to a testnet endpoint', () => {
  const n = resolveArcNetwork({
    ARC_NETWORK: 'mainnet',
    ARC_TESTNET_RPC_URL: 'https://rpc.testnet.arc.network',
    ARC_CIRCLE_BLOCKCHAIN: 'ARC',
  });
  assert.equal(n.chainId, 5042);
  assert.deepEqual(n.rpcUrls, ['https://rpc.mainnet.arc.io']);
  assert.equal(n.explorer, 'https://explorer.arc.io');
});

test('mainnet uses our own node when configured', () => {
  const n = resolveArcNetwork({
    ARC_NETWORK: 'mainnet',
    ARC_RPC_URL: 'https://rpc.karwan.example',
    ARC_RPC_URLS: 'https://rpc.mainnet.arc.io',
    ARC_CIRCLE_BLOCKCHAIN: 'ARC',
  });
  assert.deepEqual(n.rpcUrls, ['https://rpc.karwan.example', 'https://rpc.mainnet.arc.io']);
});

test('mainnet refuses to start without a Circle blockchain id', () => {
  assert.throws(() => resolveArcNetwork({ ARC_NETWORK: 'mainnet' }), /ARC_CIRCLE_BLOCKCHAIN/);
});

test('both networks share USDC and CCTP domain but not other addresses', () => {
  const t = resolveArcNetwork({ ARC_NETWORK: 'testnet' });
  const m = resolveArcNetwork({ ARC_NETWORK: 'mainnet', ARC_CIRCLE_BLOCKCHAIN: 'ARC' });
  assert.equal(t.contracts.usdc, m.contracts.usdc);
  assert.equal(t.cctpDomain, m.cctpDomain);
  assert.notEqual(t.contracts.gatewayWallet, m.contracts.gatewayWallet);
  assert.notEqual(t.contracts.usycTeller, m.contracts.usycTeller);
});
