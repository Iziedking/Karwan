import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET ??= 'terms-route-test-secret-at-least-32-characters';
const { termsRoutes, termsAcceptanceMessage, __test } = await import('./terms.js');
const { signSession } = await import('../auth/session.js');
const { config } = await import('../config.js');

// A passkey account is a smart wallet, usually not deployed yet at sign-up, so
// its signature only verifies through the chain (ERC-1271 / ERC-6492), never
// through plain ecrecover.
const wallet = '0x771fa5f21db1a51b807e78d0b8cae0636d465ac3';
const smartWalletSignature = `0x${'ab'.repeat(300)}`;

function accept(signature: string) {
  const cookie = `karwan_session=${signSession({ address: wallet, method: 'web3' })}`;
  return termsRoutes.request('/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ version: config.TERMS_CURRENT_VERSION, signature }),
  });
}

test('a smart wallet signature is checked on chain and records the acceptance', async () => {
  const seen: Array<{ address: string; message: string }> = [];
  __test.setVerifier(async ({ address, message, signature }) => {
    seen.push({ address, message });
    return signature === smartWalletSignature;
  });
  const res = await accept(smartWalletSignature);
  assert.equal(res.status, 200);
  assert.deepEqual(seen, [{ address: wallet, message: termsAcceptanceMessage(wallet, config.TERMS_CURRENT_VERSION) }]);
});

test('a signature the chain rejects is still refused', async () => {
  __test.setVerifier(async () => false);
  const res = await accept(`0x${'cd'.repeat(65)}`);
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { code: string }).code, 'BAD_SIGNATURE');
});
