import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// A Telegram-only account swaps its placeholder email for a real one, so the
/// website can sign it in with the same wallet.
///
///   npx tsx --test src/db/users.changeEmail.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-users-email-')));
delete process.env.DATABASE_URL;
const { changeUserEmail, createUser, getUserByAddress, getUserByEmail } = await import('./users.js');

test('the placeholder email is replaced and the wallet stays the same', () => {
  createUser({ email: 'tg-abc@telegram.invalid', address: '0xAA', circleIdentityWalletId: 'w1' });
  const moved = changeUserEmail('0xaa', ' Ada@Example.com ');
  assert.equal(moved?.email, 'ada@example.com');
  assert.equal(getUserByEmail('ada@example.com')?.address, '0xaa');
  assert.equal(getUserByEmail('tg-abc@telegram.invalid'), null);
  assert.equal(getUserByAddress('0xaa')?.circleIdentityWalletId, 'w1');
});

test('an email another account uses is refused', () => {
  createUser({ email: 'taken@example.com', address: '0xbb', circleIdentityWalletId: 'w2' });
  createUser({ email: 'tg-def@telegram.invalid', address: '0xcc', circleIdentityWalletId: 'w3' });
  assert.throws(() => changeUserEmail('0xcc', 'taken@example.com'), /already/);
  assert.equal(getUserByAddress('0xcc')?.email, 'tg-def@telegram.invalid');
});

test('an unknown address changes nothing', () => {
  assert.equal(changeUserEmail('0xdead', 'x@example.com'), null);
});
