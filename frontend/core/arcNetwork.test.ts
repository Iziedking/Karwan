import assert from 'node:assert/strict';
import test from 'node:test';
import { chainFor, parseArcNetwork, publicRpcFor } from './arcNetwork';
import { networkPresentation } from '../shared/chain/networkPresentation';

test('unset means testnet, as the app has always run', () => {
  assert.equal(parseArcNetwork(undefined), 'testnet');
  assert.equal(parseArcNetwork(''), 'testnet');
  assert.equal(chainFor('testnet').id, 5042002);
});

test('mainnet is chain 5042 and is presented as mainnet, not unknown', () => {
  const chain = chainFor('mainnet');
  assert.equal(chain.id, 5042);
  assert.equal(networkPresentation(chain).environment, 'mainnet');
  assert.equal(networkPresentation(chain).faucetUrl, undefined, 'no faucet on mainnet');
  assert.equal(networkPresentation(chain).explorerUrl, 'https://explorer.arc.io');
});

test('a typo fails loudly instead of quietly running testnet', () => {
  assert.equal(parseArcNetwork(' Mainnet '), 'mainnet');
  assert.throws(() => parseArcNetwork('mainet'), /NEXT_PUBLIC_ARC_NETWORK/);
});

test('each network has its own public RPC fallback', () => {
  assert.equal(publicRpcFor('testnet'), 'https://rpc.testnet.arc.network');
  assert.equal(publicRpcFor('mainnet'), 'https://rpc.mainnet.arc.io');
});
