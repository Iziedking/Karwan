import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asksForSecret,
  caseKindFromFacts,
  firstReplyDue,
  joinOrOpen,
  outOfHoursLine,
  parseRef,
  refFor,
} from './caseRules.js';

const lagos = (s: string) => Date.parse(s.replace(' ', 'T') + ':00+01:00');

test('due two hours later inside hours', () => {
  assert.equal(firstReplyDue(lagos('2026-11-12 10:00')), lagos('2026-11-12 12:00'));
});

test('opened at 21:30 is due 09:30 next day', () => {
  assert.equal(firstReplyDue(lagos('2026-11-12 21:30')), lagos('2026-11-13 09:30'));
});

test('opened at 03:00 is due 10:00', () => {
  assert.equal(firstReplyDue(lagos('2026-11-13 03:00')), lagos('2026-11-13 10:00'));
});

test('out of hours line names the time and the case', () => {
  assert.equal(outOfHoursLine(lagos('2026-11-12 23:10'), 'KS-1042'), 'Our team is back at 8am Lagos time. Your case is KS-1042.');
});

test('no out of hours line in hours', () => {
  assert.equal(outOfHoursLine(lagos('2026-11-12 09:00'), 'KS-1042'), null);
});

test('references per network', () => {
  assert.equal(refFor('mainnet', 1001), 'KS-1001');
  assert.equal(refFor('testnet', 1042), 'KT-1042');
});

test('a subject carries a ref or a legacy id', () => {
  assert.deepEqual(parseRef('Re: Your payout [KS-1042]'), { ref: 'KS-1042' });
  assert.deepEqual(parseRef('Re: Ticket KSUP-a1b2c3d4e5'), { legacyId: 'KSUP-a1b2c3d4e5' });
  assert.equal(parseRef('hello'), null);
});

test('kind from records first', () => {
  assert.equal(caseKindFromFacts({ records: [{ kind: 'transfer', id: 't1' }], text: '' }), 'transfer_missing');
  assert.equal(caseKindFromFacts({ records: [{ kind: 'deal', id: 'd1' }], text: '' }), 'money_in_deal');
  assert.equal(caseKindFromFacts({ records: [], text: 'I cannot sign in' }), 'account');
  assert.equal(caseKindFromFacts({ records: [], text: 'how do I post a request' }), 'using_karwan');
});

test('same deal joins the open case, a solved one too', () => {
  const open = [{ ref: 'KS-1001', state: 'solved' as const, records: [{ kind: 'deal' as const, id: 'd1' }] }];
  assert.equal(joinOrOpen(open, [{ kind: 'deal', id: 'd1' }]), 'KS-1001');
  assert.equal(joinOrOpen(open, [{ kind: 'deal', id: 'd2' }]), null);
});

test('a reply asking for a code is held', () => {
  for (const t of ['Send me the OTP you got', 'What is your password?', 'Share your seed phrase', 'Send your card number and CVV']) {
    assert.equal(asksForSecret(t), true, t);
  }
});

test('ordinary replies are not held', () => {
  for (const t of [
    'We sent ₦12,400,000 back to your balance',
    'Deal D68F-E7D8 is released',
    'Your case KS-1042 is solved',
    'Never share your password with anyone, including us',
  ]) {
    assert.equal(asksForSecret(t), false, t);
  }
});
