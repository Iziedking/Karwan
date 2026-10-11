import assert from 'node:assert/strict';
import test from 'node:test';
import { installChannelPorts, messageNumber, openLinkFor, tellAccount } from './sender.js';

const TG = '0x00000000000000000000000000000000000000a1';
const WA = '0x00000000000000000000000000000000000000b2';

test('a message goes only to the channel that holds the account', async () => {
  const sent: string[] = [];
  installChannelPorts('telegram', {
    toAddress: async (address) => (address === TG ? (sent.push(`tg:${address}`), true) : false),
    openLink: async (address) => (address === TG ? 'https://tg/link' : null),
  });
  installChannelPorts('whatsapp', {
    toAddress: async (address) => (address === WA ? (sent.push(`wa:${address}`), true) : false),
    openLink: async (address) => (address === WA ? 'https://wa/link' : null),
    toNumber: async () => true,
  });
  assert.equal(await tellAccount(TG, { kind: 'text', body: 'hi' }), true);
  assert.equal(await tellAccount(WA, { kind: 'text', body: 'hi' }), true);
  assert.deepEqual(sent, [`tg:${TG}`, `wa:${WA}`]);
  assert.equal(await tellAccount('0x00000000000000000000000000000000000000c3', { kind: 'text', body: 'hi' }), false);
  assert.equal(await openLinkFor(TG, '/verify/person'), 'https://tg/link');
  assert.equal(await openLinkFor(WA, '/verify/person'), 'https://wa/link');
  assert.equal(await messageNumber('2348000000000', { kind: 'text', body: 'hi' }), true);
});
