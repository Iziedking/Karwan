import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blocksOffer,
  clearSellerBindingCache,
  sellerAgentBinding,
  sellerBindingRefusal,
  sellerLinkFor,
  vaultLinkMatters,
} from './sellerBinding.js';

const agent = '0x121e7ff8a9b47d171d4b6d910e487eda34e37be2';
const person = '0x1453141466d37193e27d5b82eb64b719290cd030';

test('an agent that resolves to itself is unbound, and funding is refused', async () => {
  clearSellerBindingCache();
  const state = await sellerAgentBinding(agent, person, async () => agent);
  assert.equal(state.kind, 'unbound');
  assert.equal(sellerBindingRefusal(state)?.code, 'SELLER_NOT_BOUND');
  assert.match(sellerBindingRefusal(state)!.message, /No funds moved/);
  assert.equal(blocksOffer(state), true);
});

test('an agent bound to its person funds and offers', async () => {
  clearSellerBindingCache();
  const state = await sellerAgentBinding(agent, person, async () => person.toUpperCase().replace('0X', '0x'));
  assert.equal(state.kind, 'bound');
  assert.equal(sellerBindingRefusal(state), null);
  assert.equal(blocksOffer(state), false);
});

test('an agent bound to someone else is refused', async () => {
  clearSellerBindingCache();
  const state = await sellerAgentBinding(agent, person, async () => '0x000000000000000000000000000000000000dead');
  assert.equal(state.kind, 'foreign');
  assert.ok(sellerBindingRefusal(state));
  assert.equal(blocksOffer(state), true);
});

test('a failed read refuses funding but never drops an offer, and is not cached', async () => {
  clearSellerBindingCache();
  const failed = await sellerAgentBinding(agent, person, async () => {
    throw new Error('rpc down');
  });
  assert.equal(failed.kind, 'unknown');
  assert.ok(sellerBindingRefusal(failed));
  assert.equal(blocksOffer(failed), false);
  const next = await sellerAgentBinding(agent, person, async () => person);
  assert.equal(next.kind, 'bound');
});

test('a fresh answer is reused for a minute, then read again', async () => {
  clearSellerBindingCache();
  let reads = 0;
  const read = async () => {
    reads += 1;
    return person;
  };
  await sellerAgentBinding(agent, person, read, 1_000);
  await sellerAgentBinding(agent, person, read, 30_000);
  assert.equal(reads, 1);
  await sellerAgentBinding(agent, person, read, 62_000);
  assert.equal(reads, 2);
});

test('the vault link matters only on the older escrows, never on the escrow family', () => {
  assert.equal(vaultLinkMatters('suite'), false);
  assert.equal(vaultLinkMatters('v3'), true);
  assert.equal(vaultLinkMatters(null), true);
});

test('a deal on the escrow family never reads the vault, so an unlinked seller is not held back', async () => {
  clearSellerBindingCache();
  let reads = 0;
  const state = await sellerLinkFor('suite', agent, person, async () => {
    reads += 1;
    return agent;
  });
  assert.equal(reads, 0);
  assert.equal(sellerBindingRefusal(state), null);
  assert.equal(blocksOffer(state), false);
});

test('a deal on an older escrow still needs the link', async () => {
  clearSellerBindingCache();
  const state = await sellerLinkFor('v3', agent, person, async () => agent);
  assert.equal(state.kind, 'unbound');
  assert.equal(sellerBindingRefusal(state)?.code, 'SELLER_NOT_BOUND');
});
