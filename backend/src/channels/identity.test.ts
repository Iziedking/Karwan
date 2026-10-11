import assert from 'node:assert/strict';
import test from 'node:test';
import type { WhatsappAccount } from '../db/whatsapp.js';
import { chatAccountEmail } from '../emails/chatRecipients.js';
import { CHAT_TERMS_VERSION, createIdentity, hashNumber, type IdentityDeps } from './identity.js';

function setup(overrides: Partial<IdentityDeps<WhatsappAccount>> = {}) {
  const accounts = new Map<string, WhatsappAccount>();
  const calls = { provision: 0, createUser: [] as string[], activate: [] as string[] };
  const deps: IdentityDeps<WhatsappAccount> = {
    now: () => 1_000,
    keyOf: (from) => hashNumber(from, 'pepper-1'),
    blank: (numberHash, to) => ({ numberHash, to, address: null, termsVersion: null, termsAt: null, lastInboundAt: null, queue: [] }),
    emailOf: chatAccountEmail,
    getAccount: async (h) => accounts.get(h) ?? null,
    saveAccount: async (a) => {
      accounts.set(a.numberHash, a);
      return a;
    },
    provisionIdentity: async () => {
      calls.provision++;
      return { walletId: `w${calls.provision}`, address: `0x${String(calls.provision).padStart(40, '0')}` };
    },
    createUser: (u) => {
      calls.createUser.push(u.email);
    },
    activate: async (address) => {
      calls.activate.push(address);
    },
    ...overrides,
  };
  return { identity: createIdentity(deps), accounts, calls };
}

test('the number hash never contains the number and changes with the pepper', () => {
  const a = hashNumber('2348012345678', 'p1');
  assert.ok(!a.includes('8012345678'));
  assert.equal(a, hashNumber('2348012345678', 'p1'));
  assert.notEqual(a, hashNumber('2348012345678', 'p2'));
});

test('a first message creates a pending account with no wallet', async () => {
  const { identity, calls } = setup();
  const a = await identity.getOrStart('2348012345678');
  assert.equal(a.address, null);
  assert.equal(a.termsVersion, null);
  assert.equal(a.to, '2348012345678');
  assert.equal(calls.provision, 0);
});

test('the same number always maps to the same account', async () => {
  const { identity } = setup();
  const a = await identity.getOrStart('2348012345678');
  const b = await identity.getOrStart('2348012345678');
  assert.equal(a.numberHash, b.numberHash);
});

test('accepting terms provisions once, records the version and activates', async () => {
  const { identity, calls } = setup();
  const a = await identity.getOrStart('2348012345678');
  const accepted = await identity.acceptTerms(a.numberHash);
  assert.equal(accepted.termsVersion, CHAT_TERMS_VERSION);
  assert.equal(accepted.termsAt, 1_000);
  assert.ok(accepted.address);
  assert.equal(calls.provision, 1);
  assert.match(calls.createUser[0], /@whatsapp\.invalid$/);
  assert.deepEqual(calls.activate, [accepted.address]);
  await identity.acceptTerms(a.numberHash);
  assert.equal(calls.provision, 1, 'a second accept is a no-op');
});

test('a failed activation keeps the account and retries on the next accept', async () => {
  let fail = true;
  const { identity, calls } = setup({
    activate: async () => {
      if (fail) throw new Error('circle down');
    },
  });
  const a = await identity.getOrStart('1');
  await assert.rejects(identity.acceptTerms(a.numberHash), /circle down/);
  fail = false;
  const again = await identity.acceptTerms(a.numberHash);
  assert.ok(again.address);
  assert.equal(calls.provision, 1, 'the identity wallet is never created twice');
});
