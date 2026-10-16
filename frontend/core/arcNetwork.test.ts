import assert from 'node:assert/strict';
import test from 'node:test';
import { arcRpcPool, chainFor, explorerTxUrl, parseArcNetwork, publicRpcFor } from './arcNetwork';
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

test('the dedicated RPC leads and the public ones follow, so the site stays on chain when it is down', () => {
  // On testnet dRPC backs up the public Arc RPC, which has gone dark on its own before.
  assert.deepEqual(arcRpcPool('testnet', 'https://dedicated.example'), [
    'https://dedicated.example',
    'https://rpc.testnet.arc.network',
    'https://arc-testnet.drpc.org',
  ]);
  // A testnet fallback never reaches a mainnet build.
  assert.deepEqual(arcRpcPool('mainnet', 'https://dedicated.example'), [
    'https://dedicated.example',
    'https://rpc.mainnet.arc.io',
  ]);
});

test('without a dedicated RPC the public ones are the pool, with no blanks or repeats', () => {
  assert.deepEqual(arcRpcPool('testnet', undefined), ['https://rpc.testnet.arc.network', 'https://arc-testnet.drpc.org']);
  assert.deepEqual(arcRpcPool('testnet', '  '), ['https://rpc.testnet.arc.network', 'https://arc-testnet.drpc.org']);
  assert.deepEqual(arcRpcPool('mainnet', 'https://rpc.mainnet.arc.io'), ['https://rpc.mainnet.arc.io']);
});

test('transaction links open the explorer of the network they happened on', () => {
  assert.equal(explorerTxUrl(chainFor('mainnet'), '0xabc'), 'https://explorer.arc.io/tx/0xabc');
  assert.equal(explorerTxUrl(chainFor('testnet'), '0xabc'), 'https://testnet.arcscan.app/tx/0xabc');
});
