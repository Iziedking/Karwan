import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboarding, type OnboardingDeps } from './onboarding.js';
import type { OutMessage } from './render.js';
import type { ChatAccount, InboundMessage } from './types.js';

/// Signing in or up from a chat, before the agent takes over.
///
///   npx tsx --test src/channels/onboarding.test.ts

const text = (t: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'text', text: t, messageRef: '77' });
const tap = (replyId: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'button', replyId });
const blank = (): ChatAccount => ({ numberHash: 'h1', to: 'tg:1', address: null, termsVersion: null, termsAt: null, lastInboundAt: null });
const done = (over: Partial<ChatAccount> = {}): ChatAccount => ({ ...blank(), address: '0xabc', activated: true, onboarding: { step: 'done' }, ...over });

function setup(over: Partial<OnboardingDeps<ChatAccount>> = {}) {
  const codesSent: string[] = [];
  const deleted: string[] = [];
  const created: string[] = [];
  let joinKind: 'joined' | 'new' | 'not_invited' | 'email_taken' | 'other_chat' | 'passkey' = 'new';
  let checkResult: 'ok' | 'wrong' | 'expired' | 'locked' | 'none' = 'ok';
  let tagOf: string | null = null;
  let limited = false;
  const deps: OnboardingDeps<ChatAccount> = {
    webBase: 'https://karwan.site',
    sendCode: async (email) => {
      codesSent.push(email);
      return !limited;
    },
    checkCode: () => checkResult,
    emailAccounts: {
      joinOrCreate: async (_email, account) => ({
        kind: joinKind,
        account: joinKind === 'joined' ? { ...account, address: '0xweb', activated: true } : account,
      }),
      create: async (email, account) => {
        created.push(email);
        return { ...account, address: '0xnew', activated: true };
      },
    },
    tagOf: async () => tagOf,
    placeholderEmail: async () => false,
    enterTag: async (account) => ({ account: { ...account, onboarding: { step: 'tag' } }, out: [{ kind: 'text', body: 'Pick your Karwan tag.' }] }),
    deleteMessage: async (m) => {
      deleted.push(m.messageRef ?? '');
    },
    ...over,
  };
  const ob = createOnboarding(deps);
  const run = async (account: ChatAccount, m: InboundMessage) => ob.handle(account, m);
  return {
    run,
    codesSent,
    deleted,
    created,
    setJoin: (k: typeof joinKind) => (joinKind = k),
    setCheck: (k: typeof checkResult) => (checkResult = k),
    setTag: (t: string | null) => (tagOf = t),
    setLimited: (v: boolean) => (limited = v),
  };
}

const ids = (m: OutMessage | undefined) => (m && m.kind === 'buttons' ? m.buttons.map((b) => b.id) : []);
const bodyOf = (m: OutMessage | undefined) => (m && 'body' in m ? m.body : '');

test('a first message gets the choice between an existing account and a new one', async () => {
  const s = setup();
  const r = await s.run(blank(), text('hi'));
  assert.equal(r?.account.onboarding?.step, 'choose');
  assert.deepEqual(ids(r?.out[0]), ['ob:have', 'ob:new']);
});

test('new person: email, code, terms, then the tag step', async () => {
  const s = setup();
  let a = (await s.run(blank(), text('hi')))!.account;
  a = (await s.run(a, tap('ob:new')))!.account;
  assert.equal(a.onboarding?.step, 'email');
  const asked = await s.run(a, text('  Ada@Example.com '));
  a = asked!.account;
  assert.deepEqual(s.codesSent, ['ada@example.com']);
  assert.equal(a.onboarding?.step, 'code');
  assert.match(bodyOf(asked!.out[0]), /ada@example\.com/);
  const coded = await s.run(a, text('123 456'));
  a = coded!.account;
  assert.equal(a.onboarding?.step, 'terms');
  assert.deepEqual(ids(coded!.out[0]), ['ob:terms']);
  assert.match(bodyOf(coded!.out[0]), /karwan\.site\/terms\/chat/);
  const accepted = await s.run(a, tap('ob:terms'));
  assert.deepEqual(s.created, ['ada@example.com']);
  assert.equal(accepted!.account.address, '0xnew');
  assert.equal(accepted!.account.onboarding?.step, 'tag');
});

test('something that is not an email is asked again', async () => {
  const s = setup();
  const r = await s.run({ ...blank(), onboarding: { step: 'email', mode: 'new' } }, text('my email'));
  assert.equal(r?.account.onboarding?.step, 'email');
  assert.equal(s.codesSent.length, 0);
  assert.match(bodyOf(r?.out[0]), /doesn't look like an email/);
});

test('the message holding the code is deleted whatever the result', async () => {
  const s = setup();
  s.setCheck('wrong');
  const at = { ...blank(), onboarding: { step: 'code' as const, mode: 'new' as const, email: 'ada@example.com' } };
  const wrong = await s.run(at, text('000000'));
  assert.match(bodyOf(wrong?.out[0]), /didn't match/);
  assert.equal(wrong?.account.onboarding?.step, 'code');
  s.setCheck('ok');
  await s.run(at, text('123456'));
  assert.deepEqual(s.deleted, ['77', '77']);
});

test('an expired code sends a fresh one', async () => {
  const s = setup();
  s.setCheck('expired');
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'new', email: 'ada@example.com' } }, text('123456'));
  assert.deepEqual(s.codesSent, ['ada@example.com']);
  assert.match(bodyOf(r?.out[0]), /expired/);
});

test('an email that already has an account joins it, skips the terms and finishes when it has a tag', async () => {
  const s = setup();
  s.setJoin('joined');
  s.setTag('ada');
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'have', email: 'ada@example.com' } }, text('123456'));
  assert.equal(r?.account.address, '0xweb');
  assert.equal(r?.account.onboarding?.step, 'done');
  assert.match(bodyOf(r?.out[0]), /You're in, @ada/);
  assert.equal(s.created.length, 0);
});

test('a joined account without a tag goes to the tag step', async () => {
  const s = setup();
  s.setJoin('joined');
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'have', email: 'ada@example.com' } }, text('123456'));
  assert.equal(r?.account.onboarding?.step, 'tag');
});

test('an uninvited email on mainnet gets the waitlist message and starts over', async () => {
  const s = setup();
  s.setJoin('not_invited');
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'new', email: 'ada@example.com' } }, text('123456'));
  assert.match(bodyOf(r?.out[0]), /invite-only/);
  assert.equal(r?.account.onboarding?.step, 'choose');
});

test('an email another account uses is refused for a Telegram-only account', async () => {
  const s = setup();
  s.setJoin('email_taken');
  const r = await s.run({ ...done(), onboarding: { step: 'code', mode: 'have', email: 'ada@example.com' } }, text('123456'));
  assert.match(bodyOf(r?.out[0]), /already has a Karwan account/);
  assert.equal(r?.account.onboarding?.step, 'done');
});

test('a wallet user is sent to sign in on Karwan and connect Telegram from there', async () => {
  const s = setup();
  const r = await s.run({ ...blank(), onboarding: { step: 'have' } }, tap('ob:wallet'));
  const out = r?.out[0];
  assert.equal(out?.kind, 'link');
  assert.equal(out && out.kind === 'link' ? out.url : '', 'https://karwan.site/connect/telegram');
  assert.match(bodyOf(out), /Connect Telegram/);
});

test('/start halfway through starts again at the choice', async () => {
  const s = setup();
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'new', email: 'ada@example.com' } }, text('/start'));
  assert.equal(r?.account.onboarding?.step, 'choose');
  assert.equal(r?.account.onboarding?.email, undefined);
});

test('a stale onboarding tap after setup changes nothing and creates nothing', async () => {
  const s = setup();
  const r = await s.run(done(), tap('ob:new'));
  assert.deepEqual(r?.out, []);
  assert.equal(r?.account.onboarding?.step, 'done');
  assert.equal(s.created.length, 0);
});

test('a finished account talking normally is left to the agent', async () => {
  const s = setup();
  assert.equal(await s.run(done(), text('find me a designer')), null);
});

test('an account made before onboarding existed is treated as finished', async () => {
  const s = setup();
  assert.equal(await s.run({ ...blank(), address: '0xold', activated: true }, text('hello')), null);
});

test('an older Telegram-only account is asked for its email once, and the message still reaches the agent', async () => {
  const s = setup({ placeholderEmail: async () => true });
  const first = await s.run(done(), text('hello'));
  assert.deepEqual(ids(first?.out[0]), ['ob:addemail']);
  assert.equal(first?.passThrough, true);
  assert.equal(first?.account.emailAsked, true);
  assert.equal(await s.run(first!.account, text('hello again')), null);
});

test('adding an email from a finished account goes back to done after the code', async () => {
  const s = setup({ placeholderEmail: async () => true });
  let a = (await s.run(done({ emailAsked: true }), tap('ob:addemail')))!.account;
  assert.equal(a.onboarding?.step, 'email');
  a = (await s.run(a, text('ada@example.com')))!.account;
  s.setJoin('joined');
  s.setTag('ada');
  const r = await s.run(a, text('123456'));
  assert.equal(r?.account.onboarding?.step, 'done');
});

test('steps after the email belong to the later steps', async () => {
  const s = setup({ later: async (a) => ({ account: { ...a, onboarding: { step: 'role' } }, out: [{ kind: 'text', body: 'Tag saved.' }] }) });
  const r = await s.run({ ...blank(), address: '0xabc', activated: true, onboarding: { step: 'tag' } }, text('ada'));
  assert.equal(r?.account.onboarding?.step, 'role');
  assert.equal(bodyOf(r?.out[0]), 'Tag saved.');
});

test('an email that already had too many codes is told to wait, and stays on the email step', async () => {
  const s = setup();
  s.setLimited(true);
  const r = await s.run({ ...blank(), onboarding: { step: 'email', mode: 'new' } }, text('ada@example.com'));
  assert.match(bodyOf(r?.out[0]), /Wait 10 minutes/);
  assert.equal(r?.account.onboarding?.step, 'email');
});

test('an expired code is not resent once the email is limited', async () => {
  const s = setup();
  s.setCheck('expired');
  s.setLimited(true);
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'new', email: 'ada@example.com' } }, text('123456'));
  assert.match(bodyOf(r?.out[0]), /Wait 10 minutes/);
});

test('text that is not a code at the code step is not counted as a guess', async () => {
  let checked = 0;
  const s = setup({ checkCode: () => {
    checked++;
    return 'wrong';
  } });
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'new', email: 'ada@example.com' } }, text('hi'));
  assert.equal(checked, 0);
  assert.deepEqual(s.deleted, []);
  assert.match(bodyOf(r?.out[0]), /6-digit code/);
  assert.equal(r?.account.onboarding?.step, 'code');
});

test('/start while adding an email returns a working account to the agent', async () => {
  const s = setup({ placeholderEmail: async () => true });
  const r = await s.run(done({ emailAsked: true, onboarding: { step: 'code', mode: 'have', email: 'ada@example.com' } }), text('/start'));
  assert.equal(r?.account.onboarding?.step, 'done');
});

test('another Telegram already on that account is refused plainly', async () => {
  const s = setup();
  s.setJoin('other_chat');
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'have', email: 'ada@example.com' } }, text('123456'));
  assert.match(bodyOf(r?.out[0]), /already linked to another Telegram/);
  assert.equal(r?.account.onboarding?.step, 'choose');
});

test('a passkey account on the website is sent to connect Telegram there', async () => {
  const s = setup();
  s.setJoin('passkey');
  const r = await s.run({ ...blank(), onboarding: { step: 'code', mode: 'have', email: 'ada@example.com' } }, text('123456'));
  assert.equal(r?.out[0]?.kind, 'link');
  assert.match(bodyOf(r?.out[0]), /passkey/);
});
