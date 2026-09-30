import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupContact, parseContact } from './counterpartyInput';

test('an email is an email, lowercased', () => {
  assert.deepEqual(parseContact(' Ada@Example.com '), { kind: 'email', email: 'ada@example.com' });
});

test('a handle is a tag, with or without the @', () => {
  assert.deepEqual(parseContact('@Ada_Obi'), { kind: 'tag', tag: 'ada_obi', karwanShaped: true });
  assert.deepEqual(parseContact('ada'), { kind: 'tag', tag: 'ada', karwanShaped: true });
});

test('a Paytag-only shape is still a tag, but not a Karwan tag', () => {
  assert.deepEqual(parseContact('@9lives-pay'), { kind: 'tag', tag: '9lives-pay', karwanShaped: false });
  assert.deepEqual(parseContact('@ab'), { kind: 'tag', tag: 'ab', karwanShaped: false });
});

test('anything else is neither', () => {
  assert.deepEqual(parseContact(''), { kind: 'empty' });
  assert.deepEqual(parseContact('ada@'), { kind: 'invalid' });
  assert.deepEqual(parseContact('two words'), { kind: 'invalid' });
  assert.deepEqual(parseContact('@ada@x'), { kind: 'invalid' });
});

const karwanHit = { found: true as const, self: false, tag: 'ada', displayName: 'Ada Obi', address: '0x00000000000000000000000000000000000000aa' };
const none = async () => ({ found: false as const, tag: 'x' });

test('a Karwan tag wins over a Paytag of the same name', async () => {
  let paytagCalls = 0;
  const result = await lookupContact({ tag: 'ada', karwanShaped: true }, {
    paytagAllowed: true,
    karwan: async () => karwanHit,
    paytag: async () => { paytagCalls += 1; return { found: true, handle: 'ada', maskedAddress: '0x12…ab' }; },
  });
  assert.deepEqual(result, { kind: 'karwan', tag: 'ada', displayName: 'Ada Obi', address: karwanHit.address });
  assert.equal(paytagCalls, 0);
});

test('your own Karwan tag is refused', async () => {
  const result = await lookupContact({ tag: 'ada', karwanShaped: true }, { paytagAllowed: true, karwan: async () => ({ ...karwanHit, self: true }), paytag: none });
  assert.equal(result, 'self');
});

test('a Paytag is used only when no Karwan account holds the tag and Paytag is allowed', async () => {
  const paytag = async () => ({ found: true, handle: '9lives', maskedAddress: '0x12…ab' });
  assert.deepEqual(
    await lookupContact({ tag: '9lives', karwanShaped: false }, { paytagAllowed: true, karwan: none, paytag }),
    { kind: 'paytag', tag: '9lives', maskedAddress: '0x12…ab' },
  );
  assert.equal(await lookupContact({ tag: '9lives', karwanShaped: false }, { paytagAllowed: false, karwan: none, paytag }), null);
});
