import assert from 'node:assert/strict';
import test from 'node:test';
import { pickEmailOwner } from './emailOwner.js';

const WALLET = '0x7711886865C33606EBD977DA02A6A25373C75A35';
const CIRCLE = '0x1111111111111111111111111111111111111111';

test('a wallet with a verified email owns it', () => {
  // The hole this closes. The deal used to mint an invite that only an email
  // login could claim, so this person got a second Circle wallet and the payout
  // went to an address with none of their history.
  assert.deepEqual(
    pickEmailOwner({ profileAddress: WALLET, profileEmailVerified: true }),
    { kind: 'owned', address: WALLET.toLowerCase(), via: 'wallet' },
  );
});

test('an unverified contact email owns nothing', () => {
  // Anyone can type any address into their own profile. Honouring that would
  // hand a stranger's deal to whoever claimed their email first.
  assert.deepEqual(
    pickEmailOwner({ profileAddress: WALLET, profileEmailVerified: false }),
    { kind: 'unclaimed' },
  );
  assert.deepEqual(pickEmailOwner({ profileAddress: WALLET }), { kind: 'unclaimed' });
});

test('an email login account owns its own email', () => {
  assert.deepEqual(pickEmailOwner({ loginAddress: CIRCLE }), {
    kind: 'owned',
    address: CIRCLE,
    via: 'login',
  });
});

test('a login account and its own profile agreeing is the ordinary case', () => {
  // An email signup gets its address auto-filled and verified on its profile,
  // so both lookups hit with the same address. That is not a conflict.
  assert.deepEqual(
    pickEmailOwner({
      loginAddress: CIRCLE,
      profileAddress: CIRCLE.toUpperCase(),
      profileEmailVerified: true,
    }),
    { kind: 'owned', address: CIRCLE, via: 'login' },
  );
});

test('two different owners stop the deal rather than picking one', () => {
  const owner = pickEmailOwner({
    loginAddress: CIRCLE,
    profileAddress: WALLET,
    profileEmailVerified: true,
  });
  assert.equal(owner.kind, 'conflict');
  if (owner.kind !== 'conflict') return;
  assert.deepEqual(owner.addresses, [CIRCLE, WALLET.toLowerCase()]);
});

test('an unverified profile does not conflict with a login account', () => {
  // Only a verified email counts as ownership, so an unverified one cannot
  // create ambiguity either.
  assert.deepEqual(
    pickEmailOwner({ loginAddress: CIRCLE, profileAddress: WALLET, profileEmailVerified: false }),
    { kind: 'owned', address: CIRCLE, via: 'login' },
  );
});

test('nobody has it', () => {
  assert.deepEqual(pickEmailOwner({}), { kind: 'unclaimed' });
  assert.deepEqual(pickEmailOwner({ loginAddress: '  ' }), { kind: 'unclaimed' });
});

test('addresses come back lower-cased, whatever case they went in as', () => {
  // Deals store lower-cased addresses and compare them as strings, so a mixed
  // case owner must not read as a different wallet.
  const owner = pickEmailOwner({ profileAddress: WALLET, profileEmailVerified: true });
  assert.equal(owner.kind === 'owned' && owner.address, WALLET.toLowerCase());
});
