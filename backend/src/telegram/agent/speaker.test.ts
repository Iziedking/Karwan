import assert from 'node:assert/strict';
import test from 'node:test';
import type { TelegramAccount } from '../../db/telegramAccounts.js';
import { withLinkedAccount } from './speaker.js';

const fresh: TelegramAccount = { numberHash: 'h', to: '555', address: null, termsVersion: null, termsAt: null, lastInboundAt: null };
const WEB = '0x00000000000000000000000000000000000000d4';

test('a chat linked from the web runs as that account and skips the chat terms', () => {
  const next = withLinkedAccount(fresh, WEB, 1_000);
  assert.equal(next?.address, WEB);
  assert.equal(next?.linkedWebAccount, true);
  assert.equal(next?.activated, true);
  assert.equal(next?.termsVersion, 'web');
});

test('nothing changes for an unlinked chat or one already on the linked address', () => {
  assert.equal(withLinkedAccount(fresh, null, 1_000), null);
  const linked = withLinkedAccount(fresh, WEB, 1_000)!;
  assert.equal(withLinkedAccount(linked, WEB.toUpperCase().replace('0X', '0x'), 2_000), null);
});

test('a chat account Karwan holds keys for is never taken over by a link', () => {
  const custodial: TelegramAccount = { ...fresh, address: '0x00000000000000000000000000000000000000e5', termsVersion: 'chat-2026-10-11', activated: true };
  assert.equal(withLinkedAccount(custodial, WEB, 1_000), null);
});

test('a link moved to another web account follows it', () => {
  const linked = withLinkedAccount(fresh, WEB, 1_000)!;
  const other = '0x00000000000000000000000000000000000000f6';
  assert.equal(withLinkedAccount(linked, other, 2_000)?.address, other);
});
