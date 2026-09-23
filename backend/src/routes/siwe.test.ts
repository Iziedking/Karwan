import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

process.env.SESSION_SECRET = 'siwe-test-session-secret-value-long';
const { siweRoutes } = await import('./siwe.js');
const { ARC } = await import('../chain/client.js');
const { signEmailProof } = await import('../auth/emailProof.js');

const address = '0x1111111111111111111111111111111111111111';

function post(path: string, body: object) {
  return siweRoutes.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://karwan.site' },
    body: JSON.stringify(body),
  });
}

async function signIn(account: ReturnType<typeof privateKeyToAccount>, emailProof?: string) {
  const { message } = (await (await post('/nonce', { address: account.address, chainId: ARC.chainId })).json()) as {
    message: string;
  };
  const signature = await account.signMessage({ message });
  return post('/verify', { address: account.address, signature, ...(emailProof ? { emailProof } : {}) });
}

test('a wallet on another chain is asked to switch instead of signing', async () => {
  const res = await post('/nonce', { address, chainId: 8453 });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; expectedChainId: number };
  assert.equal(body.code, 'wrong_chain');
  assert.equal(body.expectedChainId, ARC.chainId);
});

test('the signed message always names the app network', async () => {
  for (const req of [{ address, chainId: ARC.chainId }, { address }]) {
    const res = await post('/nonce', req);
    assert.equal(res.status, 200);
    const { message } = (await res.json()) as { message: string };
    assert.match(message, new RegExp(`^Chain ID: ${ARC.chainId}$`, 'm'));
  }
});

test('a proven email is linked at sign-in and remembered after', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const first = await signIn(account, signEmailProof('ada@example.com'));
  assert.equal(first.status, 200);
  assert.equal(((await first.json()) as { user: { email?: string } }).user.email, 'ada@example.com');

  const again = await signIn(account);
  assert.equal(((await again.json()) as { user: { email?: string } }).user.email, 'ada@example.com');
});

test('an email cannot be claimed by a second account', async () => {
  const owner = privateKeyToAccount(generatePrivateKey());
  assert.equal((await signIn(owner, signEmailProof('bob@example.com'))).status, 200);
  const other = privateKeyToAccount(generatePrivateKey());
  const res = await signIn(other, signEmailProof('bob@example.com'));
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, 'email_in_use');
});

test('a tampered email proof is refused', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const res = await signIn(account, `${signEmailProof('eve@example.com').split('.')[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, 'email_proof_invalid');
});
