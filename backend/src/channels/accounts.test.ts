import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatAccount } from './types.js';
import { createChatAccounts } from './accounts.js';

const account = (numberHash: string, address: string): ChatAccount => ({
  numberHash,
  to: 'x',
  address,
  termsVersion: null,
  termsAt: null,
  lastInboundAt: null,
});

const TG = '0x00000000000000000000000000000000000000a1';
const WA = '0x00000000000000000000000000000000000000b2';

function setup() {
  return createChatAccounts({
    telegram: async (a) => (a === TG ? account('t', TG) : null),
    whatsapp: async (a) => (a === WA ? account('w', WA) : null),
  });
}

test('an account on either channel is found with its channel', async () => {
  const { findChatAccountByAddress } = setup();
  assert.equal((await findChatAccountByAddress(TG))?.channel, 'telegram');
  assert.equal((await findChatAccountByAddress(WA))?.channel, 'whatsapp');
});

test('addresses are compared without regard to case', async () => {
  const { isChatAccount } = setup();
  assert.equal(await isChatAccount(TG.toUpperCase().replace('0X', '0x')), true);
});

test('an address that holds its own keys is not a chat account', async () => {
  const { findChatAccountByAddress, isChatAccount } = setup();
  assert.equal(await findChatAccountByAddress('0x00000000000000000000000000000000000000c3'), null);
  assert.equal(await isChatAccount('0x00000000000000000000000000000000000000c3'), false);
});
