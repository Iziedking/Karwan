import assert from 'node:assert/strict';
import test from 'node:test';
import { newAccountProfile, signupRefusal } from './signup.js';

const base = { network: 'testnet' as const, hasProfile: false, tagAvailable: true };

test('a free, valid tag on a fresh session may sign up', () => {
  assert.equal(signupRefusal({ ...base, tag: 'ada', accountKind: 'person' }), null);
  assert.equal(signupRefusal({ ...base, tag: 'ada', accountKind: 'business' }), null);
});

test('refuses a malformed, reserved or taken tag', () => {
  assert.deepEqual(signupRefusal({ ...base, tag: 'a', accountKind: 'person' }), { status: 400, code: 'too_short' });
  assert.deepEqual(signupRefusal({ ...base, tag: 'karwan', accountKind: 'person' }), { status: 400, code: 'reserved' });
  assert.deepEqual(signupRefusal({ ...base, tag: 'ada', tagAvailable: false, accountKind: 'person' }), { status: 409, code: 'tag_taken' });
});

test('an account that already exists is not created twice', () => {
  assert.deepEqual(signupRefusal({ ...base, hasProfile: true, tag: 'ada', accountKind: 'person' }), { status: 409, code: 'account_exists' });
});

test('business accounts wait on mainnet', () => {
  assert.deepEqual(
    signupRefusal({ ...base, network: 'mainnet', tag: 'ada', accountKind: 'business' }),
    { status: 403, code: 'business_unavailable' },
  );
  assert.equal(signupRefusal({ ...base, network: 'mainnet', tag: 'ada', accountKind: 'person' }), null);
});

test('the new profile is named by its tag and carries a neutral buyer default', () => {
  const p = newAccountProfile('0xABCDEF0000000000000000000000000000000001', 'ada', 'person');
  assert.equal(p.address, '0xabcdef0000000000000000000000000000000001');
  assert.equal(p.handle, 'ada');
  assert.equal(p.displayName, 'ada');
  assert.equal(p.accountKind, 'person');
  assert.equal(p.role, 'buyer');
  assert.deepEqual(p.buyer?.milestonePcts, [100]);
});
