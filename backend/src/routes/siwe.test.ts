import assert from 'node:assert/strict';
import test from 'node:test';
import { siweRoutes } from './siwe.js';
import { ARC } from '../chain/client.js';

const address = '0x1111111111111111111111111111111111111111';

function nonce(body: object) {
  return siweRoutes.request('/nonce', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://karwan.site' },
    body: JSON.stringify(body),
  });
}

test('a wallet on another chain is asked to switch instead of signing', async () => {
  const res = await nonce({ address, chainId: 8453 });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; expectedChainId: number };
  assert.equal(body.code, 'wrong_chain');
  assert.equal(body.expectedChainId, ARC.chainId);
});

test('the signed message always names the app network', async () => {
  for (const req of [{ address, chainId: ARC.chainId }, { address }]) {
    const res = await nonce(req);
    assert.equal(res.status, 200);
    const { message } = (await res.json()) as { message: string };
    assert.match(message, new RegExp(`^Chain ID: ${ARC.chainId}$`, 'm'));
  }
});
