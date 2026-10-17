import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmailAccounts, type EmailAccountDeps } from './emailAccounts.js';
import type { ChatAccount } from './types.js';

/// Joining the Karwan account an email already has, or creating one with the
/// real email, from a chat.
///
///   npx tsx --test src/channels/emailAccounts.test.ts

type User = { email: string; address: string; circleIdentityWalletId: string };

const blank = (): ChatAccount => ({ numberHash: 'h1', to: 'tg:1', address: null, termsVersion: null, termsAt: null, lastInboundAt: null });

function setup(over: Partial<EmailAccountDeps<ChatAccount>> = {}) {
  const users = new Map<string, User>();
  const calls = { provision: 0, activate: [] as string[], links: [] as string[], waitlist: [] as string[], changed: [] as string[] };
  let activateFails = false;
  const deps: EmailAccountDeps<ChatAccount> = {
    now: () => 5,
    network: 'testnet',
    getUserByEmail: (email) => users.get(email) ?? null,
    getUserByAddress: (address) => [...users.values()].find((u) => u.address === address) ?? null,
    isInvited: async () => false,
    joinWaitlist: async (email) => {
      calls.waitlist.push(email);
    },
    refHash: (email) => `ref:${email}`,
    provisionIdentity: async () => {
      calls.provision++;
      return { walletId: 'w-new', address: '0xNEW' };
    },
    createUser: (u) => {
      users.set(u.email, { ...u, address: u.address.toLowerCase() });
    },
    changeUserEmail: (address, email) => {
      calls.changed.push(`${address}>${email}`);
      const u = [...users.values()].find((x) => x.address === address)!;
      users.delete(u.email);
      users.set(email, { ...u, email });
    },
    isPlaceholder: (email) => email.endsWith('@telegram.invalid'),
    activate: async (address) => {
      if (activateFails) throw new Error('activation answered 409');
      calls.activate.push(address);
    },
    link: async (address) => {
      calls.links.push(address);
    },
    chatOf: async () => null,
    passkeyAccount: async () => false,
    ...over,
  };
  return { ea: createEmailAccounts(deps), users, calls, failActivate: (v: boolean) => (activateFails = v) };
}

test('an email that already has an account joins it, turns its agents on and creates nothing', async () => {
  const s = setup();
  s.users.set('ada@example.com', { email: 'ada@example.com', address: '0xweb', circleIdentityWalletId: 'w' });
  const r = await s.ea.joinOrCreate('ada@example.com', blank());
  assert.equal(r.kind, 'joined');
  assert.equal(r.account.address, '0xweb');
  assert.equal(r.account.activated, true);
  assert.deepEqual(s.calls.activate, ['0xweb']);
  assert.deepEqual(s.calls.links, ['0xweb']);
  assert.equal(s.calls.provision, 0);
});

test('a new email creates nothing until the terms are accepted', async () => {
  const s = setup();
  const r = await s.ea.joinOrCreate('ada@example.com', blank());
  assert.equal(r.kind, 'new');
  assert.equal(s.calls.provision, 0);
});

test('accepting creates one wallet with the real email, even when activation is retried', async () => {
  const s = setup();
  s.failActivate(true);
  const first = blank();
  await assert.rejects(s.ea.create('ada@example.com', first));
  s.failActivate(false);
  assert.equal(s.users.get('ada@example.com')?.address, '0xnew');
  const retried = await s.ea.create('ada@example.com', blank());
  assert.equal(s.calls.provision, 1);
  assert.equal(retried.activated, true);
  assert.equal(retried.address, '0xnew');
  assert.deepEqual(s.calls.links, ['0xnew']);
});

test('the wallet is made under the same reference the website uses for that email', async () => {
  let ref = '';
  const s = setup({
    provisionIdentity: async (r) => {
      ref = r;
      return { walletId: 'w', address: '0x1' };
    },
  });
  await s.ea.create('ada@example.com', blank());
  assert.equal(ref, 'ref:ada@example.com');
});

test('a Telegram-only account takes a free email and keeps its wallet', async () => {
  const s = setup();
  s.users.set('tg-x@telegram.invalid', { email: 'tg-x@telegram.invalid', address: '0xchat', circleIdentityWalletId: 'w' });
  const r = await s.ea.joinOrCreate('ada@example.com', { ...blank(), address: '0xchat', activated: true });
  assert.equal(r.kind, 'joined');
  assert.equal(r.account.address, '0xchat');
  assert.deepEqual(s.calls.changed, ['0xchat>ada@example.com']);
});

test('a Telegram-only account cannot take an email another account uses', async () => {
  const s = setup();
  s.users.set('tg-x@telegram.invalid', { email: 'tg-x@telegram.invalid', address: '0xchat', circleIdentityWalletId: 'w' });
  s.users.set('ada@example.com', { email: 'ada@example.com', address: '0xweb', circleIdentityWalletId: 'w2' });
  const r = await s.ea.joinOrCreate('ada@example.com', { ...blank(), address: '0xchat', activated: true });
  assert.equal(r.kind, 'email_taken');
  assert.equal(r.account.address, '0xchat');
  assert.deepEqual(s.calls.changed, []);
});

test('on mainnet an uninvited new email joins the waitlist and nothing is created', async () => {
  const s = setup({ network: 'mainnet' });
  const r = await s.ea.joinOrCreate('ada@example.com', blank());
  assert.equal(r.kind, 'not_invited');
  assert.deepEqual(s.calls.waitlist, ['ada@example.com']);
  assert.equal(s.calls.provision, 0);
});

test('on mainnet an invited new email may sign up', async () => {
  const s = setup({ network: 'mainnet', isInvited: async () => true });
  assert.equal((await s.ea.joinOrCreate('ada@example.com', blank())).kind, 'new');
});

test('an account another Telegram already uses is refused before anything changes', async () => {
  const s = setup({ chatOf: async () => 'other-chat' });
  s.users.set('ada@example.com', { email: 'ada@example.com', address: '0xweb', circleIdentityWalletId: 'w' });
  const r = await s.ea.joinOrCreate('ada@example.com', blank());
  assert.equal(r.kind, 'other_chat');
  assert.equal(r.account.address, null);
  assert.deepEqual(s.calls.activate, []);
  assert.deepEqual(s.calls.links, []);
});

test('the same chat signing in again is fine', async () => {
  const s = setup({ chatOf: async () => 'h1' });
  s.users.set('ada@example.com', { email: 'ada@example.com', address: '0xweb', circleIdentityWalletId: 'w' });
  assert.equal((await s.ea.joinOrCreate('ada@example.com', blank())).kind, 'joined');
});

test('an email that signs in with a passkey on the website is never given a second account', async () => {
  const s = setup({ network: 'mainnet', isInvited: async () => true, passkeyAccount: async (e) => e === 'ada@example.com' });
  const r = await s.ea.joinOrCreate('ada@example.com', blank());
  assert.equal(r.kind, 'passkey');
  assert.equal(s.calls.provision, 0);
});
