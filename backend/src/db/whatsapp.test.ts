import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../config.js';
import {
  claimDailySlot,
  findWhatsappAccountByAddress,
  getWhatsappAccount,
  markProcessed,
  saveWhatsappAccount,
} from './whatsapp.js';

test('a message id is processed once', async () => {
  assert.equal(await markProcessed('wamid.db.1'), true);
  assert.equal(await markProcessed('wamid.db.1'), false);
});

test('a number already counted today is free; new numbers stop at the limit', async () => {
  const day = '2026-10-11';
  const limit = config.WHATSAPP_DAILY_LIMIT;
  for (let i = 0; i < limit; i++) assert.equal(await claimDailySlot(`h${i}`, day), true);
  assert.equal(await claimDailySlot('h0', day), true);
  assert.equal(await claimDailySlot('over-the-limit', day), false);
  assert.equal(await claimDailySlot('over-the-limit', '2026-10-12'), true);
});

test('an account round-trips and is found by its lowercased address', async () => {
  await saveWhatsappAccount({
    numberHash: 'hash-a',
    to: '2348012345678',
    address: '0xABCDEF0000000000000000000000000000000001',
    termsVersion: 'chat-2026-10-10',
    termsAt: 1,
    lastInboundAt: 2,
    queue: [],
  });
  assert.equal((await getWhatsappAccount('hash-a'))?.to, '2348012345678');
  assert.equal(
    (await findWhatsappAccountByAddress('0xabcdef0000000000000000000000000000000001'))?.numberHash,
    'hash-a',
  );
  assert.equal(await getWhatsappAccount('missing'), null);
});
