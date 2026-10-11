import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findTelegramAccountByAddress,
  getTelegramAccount,
  markTelegramUpdateProcessed,
  saveTelegramAccount,
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
