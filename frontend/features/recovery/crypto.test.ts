import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveVerifier, lockRecoveryKey, unlockRecoveryKey, WrongPasswordError } from './crypto';

const FAST = { alg: 'argon2id' as const, m: 1024, t: 2, p: 1 as const };
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const W = '0x9999999999999999999999999999999999999999';
const PW = 'correct horse battery';

test('the recovery key comes back with the right password', async () => {
  const locked = await lockRecoveryKey({ password: PW, privateKey: KEY, walletAddress: W, kdf: FAST });
  assert.equal(await unlockRecoveryKey({ password: PW, walletAddress: W, ...locked }), KEY);
});

test('a wrong password, another wallet or a changed byte fails', async () => {
  const locked = await lockRecoveryKey({ password: PW, privateKey: KEY, walletAddress: W, kdf: FAST });
  await assert.rejects(() => unlockRecoveryKey({ password: 'wrong horse battery', walletAddress: W, ...locked }), WrongPasswordError);
  await assert.rejects(
    () => unlockRecoveryKey({ password: PW, walletAddress: '0x1111111111111111111111111111111111111111', ...locked }),
    WrongPasswordError,
  );
  const tampered = Buffer.from(locked.blob, 'base64url');
  tampered[0] ^= 1;
  await assert.rejects(
    () => unlockRecoveryKey({ password: PW, walletAddress: W, ...locked, blob: tampered.toString('base64url') }),
    WrongPasswordError,
  );
});

test('the verifier is stable for the same password and differs otherwise', async () => {
  const locked = await lockRecoveryKey({ password: PW, privateKey: KEY, walletAddress: W, kdf: FAST });
  assert.equal(await deriveVerifier(PW, locked.kdf), locked.verifier);
  assert.notEqual(await deriveVerifier('correct horse batterz', locked.kdf), locked.verifier);
  assert.equal(Buffer.from(locked.verifier, 'base64url').length, 32);
});

test('the locked copy never contains the key or the password in the clear', async () => {
  const locked = await lockRecoveryKey({ password: PW, privateKey: KEY, walletAddress: W, kdf: FAST });
  const all = JSON.stringify(locked);
  assert.doesNotMatch(all, new RegExp(KEY.slice(2, 20)));
  assert.doesNotMatch(all, /correct horse/);
});
