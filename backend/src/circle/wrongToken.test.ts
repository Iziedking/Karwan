import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeTokenSymbol, wrongTokenEntry } from './wrongToken.js';

test('a token is named only by a short plain symbol that does not pass for USDC', () => {
  assert.equal(safeTokenSymbol('USDT'), 'USDT');
  assert.equal(safeTokenSymbol('WETH'), 'WETH');
  assert.equal(safeTokenSymbol('USDC'), null);
  assert.equal(safeTokenSymbol('usdc.e'), null);
  assert.equal(safeTokenSymbol('USD C'), null);
  assert.equal(safeTokenSymbol('Visit claim-usdt.xyz'), null);
  assert.equal(safeTokenSymbol('ＵＳＤＴ'), null);
  assert.equal(safeTokenSymbol(''), null);
  assert.equal(safeTokenSymbol(undefined), null);
});

test('the row says what came in, carries no USDC amount, and is keyed to the transfer', () => {
  const named = wrongTokenEntry({ address: '0xABC', txId: 'tx-9', amount: '5', symbol: 'USDT', chain: 'Base' });
  assert.equal(named.id, 'wrong-token-tx-9');
  assert.equal(named.address, '0xabc');
  assert.equal(named.kind, 'wrong_token');
  assert.equal(named.amountUsdc, undefined);
  assert.equal(named.refId, 'token-tx-9');
  assert.deepEqual(named.params, { t: 'wrongToken', amount: '5', token: 'USDT', chain: 'Base' });
  assert.match(named.summary, /^Received 5 USDT on Base\. Karwan takes only USDC/);

  const unnamed = wrongTokenEntry({ address: '0xabc', txId: 'tx-10', amount: '25.5', symbol: 'USDC', chain: 'Base' });
  assert.deepEqual(unnamed.params, { t: 'wrongTokenUnnamed', amount: '25.5', chain: 'Base' });
  assert.doesNotMatch(unnamed.summary, /25\.5 USDC/);
});
