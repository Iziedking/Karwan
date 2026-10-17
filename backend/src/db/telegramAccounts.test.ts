import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimTelegramUsername,
  findTelegramAccountByAddress,
  findTelegramAccountByUsername,
  getTelegramAccount,
  markTelegramUpdateProcessed,
  saveTelegramAccount,
  type TelegramAccount,
} from './telegramAccounts.js';

test('an update is handled once', async () => {
  assert.equal(await markTelegramUpdateProcessed(9001), true);
  assert.equal(await markTelegramUpdateProcessed(9001), false);
});

test('an account round-trips and is found by its lowercased address', async () => {
  await saveTelegramAccount({
    numberHash: 'tg-hash-a',
    to: '777000111',
    address: '0xABCDEF0000000000000000000000000000000002',
    termsVersion: 'chat-2026-10-11',
    termsAt: 1,
    lastInboundAt: 2,
  });
  const byHash = await getTelegramAccount('tg-hash-a');
  assert.equal(byHash?.address, '0xabcdef0000000000000000000000000000000002');
  assert.equal(byHash?.to, '777000111');
  const byAddress = await findTelegramAccountByAddress('0xAbCdEf0000000000000000000000000000000002');
  assert.equal(byAddress?.numberHash, 'tg-hash-a');
  assert.equal(await findTelegramAccountByAddress('0x0000000000000000000000000000000000000009'), null);
});

const blank = (numberHash: string): TelegramAccount => ({
  numberHash,
  to: 'tg:1',
  address: null,
  termsVersion: null,
  termsAt: null,
  lastInboundAt: null,
});

test('a renamed Telegram user is found by the new name only', async () => {
  await saveTelegramAccount({ ...blank('h1'), address: '0xaa', tgUsername: 'old_name' });
  await saveTelegramAccount({ ...blank('h1'), address: '0xaa', tgUsername: 'new_name' });
  assert.equal((await findTelegramAccountByUsername('@New_Name'))?.address, '0xaa');
  assert.equal(await findTelegramAccountByUsername('old_name'), null);
});

test('an account with no Karwan address yet is never found by username', async () => {
  await saveTelegramAccount({ ...blank('h2'), tgUsername: 'halfway' });
  assert.equal(await findTelegramAccountByUsername('halfway'), null);
});

test('a Telegram username belongs to one account: the one that showed it last', async () => {
  await saveTelegramAccount({ ...blank('seller'), address: '0xseller', tgUsername: 'shop' });
  await saveTelegramAccount({ ...blank('seller'), address: '0xseller', tgUsername: 'shop_new' });
  await claimTelegramUsername('scammer', 'shop');
  await saveTelegramAccount({ ...blank('scammer'), address: '0xscam', tgUsername: 'shop' });
  assert.equal((await findTelegramAccountByUsername('shop'))?.address, '0xscam');
  await saveTelegramAccount({ ...blank('a1'), address: '0xa1', tgUsername: 'same' });
  await claimTelegramUsername('a2', 'same');
  await saveTelegramAccount({ ...blank('a2'), address: '0xa2', tgUsername: 'same' });
  assert.equal((await getTelegramAccount('a1'))?.tgUsername, null);
  assert.equal((await findTelegramAccountByUsername('same'))?.address, '0xa2');
});
