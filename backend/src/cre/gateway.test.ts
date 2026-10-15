import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { verifyMessage, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { buildExecuteRequest, createGatewayClient } from './gateway.js';

const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const signer = privateKeyToAccount(KEY);
const WORKFLOW = 'ab'.repeat(32);

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

test('the request carries a JWT signed by the gateway key over the sorted body', async () => {
  const { body, token } = await buildExecuteRequest({ signerKey: KEY, workflowId: WORKFLOW, input: { z: 1, a: { y: 2, b: 3 } }, nowSec: 1_800_000_000, jti: '7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6', id: 'req-1' });
  assert.equal(body, '{"id":"req-1","jsonrpc":"2.0","method":"workflows.execute","params":{"input":{"a":{"b":3,"y":2},"z":1},"workflow":{"workflowID":"' + WORKFLOW + '"}}}');
  const [h, p, s] = token.split('.');
  assert.deepEqual(JSON.parse(fromB64url(h!).toString()), { alg: 'ETH', typ: 'JWT' });
  const claims = JSON.parse(fromB64url(p!).toString());
  assert.equal(claims.digest, `0x${createHash('sha256').update(body).digest('hex')}`);
  assert.equal(claims.iss, signer.address);
  assert.equal(claims.exp - claims.iat, 300);
  assert.equal(claims.jti, '7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6');
  const signature = `0x${fromB64url(s!).toString('hex')}` as Hex;
  assert.equal(await verifyMessage({ address: signer.address, message: `${h}.${p}`, signature }), true);
});

test('starts for one workflow are at least 30 seconds apart, in order', async () => {
  let clock = 0;
  const sent: number[] = [];
  const client = createGatewayClient({
    url: 'https://gateway.example',
    signerKey: KEY,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async () => {
      sent.push(clock);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', result: { workflow_execution_id: `exec-${sent.length}`, status: 'ACCEPTED' } }));
    },
  });
  const [a, b] = await Promise.all([client.start(WORKFLOW, { n: 1 }), client.start(WORKFLOW, { n: 2 })]);
  assert.deepEqual([a.executionId, b.executionId], ['exec-1', 'exec-2']);
  assert.ok(sent[1]! - sent[0]! >= 30_000);
});

test('a gateway error is reported, not swallowed', async () => {
  const client = createGatewayClient({
    url: 'https://gateway.example',
    signerKey: KEY,
    now: () => 0,
    sleep: async () => {},
    fetch: async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', error: { code: -32600, message: 'unauthorized' } }), { status: 400 }),
  });
  await assert.rejects(client.start(WORKFLOW, {}), /CRE_GATEWAY/);
});
