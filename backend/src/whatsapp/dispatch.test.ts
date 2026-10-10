import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantAction } from '../assistant/actions.js';
import type { WhatsappAccount } from '../db/whatsapp.js';
import { createDispatcher, type DispatchDeps } from './dispatch.js';
import type { OutMessage } from './render.js';
import type { InboundMessage } from './types.js';

const NOW = 1_760_000_000_000;
const msg = (over: Partial<InboundMessage>): InboundMessage => ({ id: 'm', from: '2348012345678', timestamp: NOW, kind: 'text', text: 'hi', ...over });

const card = {
  kind: 'confirm',
  id: 'act_1:n1',
  intent: 'release_milestone',
  title: 'Release 250 USDC',
  fields: [],
  payload: {},
} as unknown as AssistantAction;

function setup(opts: { active?: boolean; chat?: DispatchDeps['chat']; execute?: DispatchDeps['executeConfirm']; acceptFails?: boolean } = {}) {
  let account: WhatsappAccount = {
    numberHash: 'h1',
    to: '2348012345678',
    address: opts.active ? '0xabc' : null,
    termsVersion: opts.active ? 'chat-2026-10-10' : null,
    termsAt: opts.active ? 1 : null,
    lastInboundAt: null,
    queue: [],
    activated: !!opts.active,
  };
  const sent: OutMessage[] = [];
  const chats: Array<{ role: string; content: string }[]> = [];
  const executed: string[] = [];
  let drained = 0;
  let reads = 0;
  const answers: string[] = [];
  const deps: DispatchDeps = {
    now: () => NOW,
    webBase: 'https://karwan.site',
    explorerTx: (h) => `https://explorer/tx/${h}`,
    getOrStart: async () => {
      reads++;
      return account;
    },
    acceptTerms: async () => {
      if (opts.acceptFails) throw new Error('circle down');
      account = { ...account, address: '0xabc', termsVersion: 'chat-2026-10-10', termsAt: NOW, activated: true };
      return account;
    },
    saveAccount: async (a) => {
      account = a;
      return a;
    },
    send: async (_to, m) => {
      sent.push(m);
      return { sent: true };
    },
    drain: async () => {
      drained++;
    },
    chat:
      opts.chat ??
      (async (_address, messages) => {
        chats.push(messages);
        return { ok: true, reply: 'Hello from the agent.' };
      }),
    clientAnswer: async (requestId, from, yes) => {
      answers.push(`${requestId}:${from}:${yes}`);
      return yes ? 'Thank you. Your answer is on their record.' : 'Thank you for answering.';
    },
    media: async () => [{ kind: 'text', body: 'I read your invoice.' }],
    executeConfirm:
      opts.execute ??
      (async (_a, action) => {
        executed.push(action.id);
        return { ok: true, summary: 'Released 250 USDC to Ada.', txHash: '0xfeed' };
      }),
  };
  return { dispatch: createDispatcher(deps), sent, chats, executed, account: () => account, drained: () => drained, reads: () => reads, answers };
}

const bodyOf = (m: OutMessage) => (m.kind === 'template' ? m.params.join(' ') : m.body);

test('an unknown number gets the welcome and an Accept button, and no turn runs', async () => {
  const s = setup();
  await s.dispatch(msg({ text: 'hi' }));
  assert.equal(s.chats.length, 0);
  const last = s.sent.at(-1)!;
  assert.equal(last.kind, 'buttons');
  assert.deepEqual((last as Extract<OutMessage, { kind: 'buttons' }>).buttons.map((b) => b.id), ['terms:accept']);
  assert.match(bodyOf(last), /karwan\.site\/terms\/chat/);
});

test('accepting the terms creates the account and asks what they sell or buy', async () => {
  const s = setup();
  await s.dispatch(msg({ kind: 'button', replyId: 'terms:accept' }));
  assert.equal(s.account().activated, true);
  assert.match(bodyOf(s.sent.at(-1)!), /what you sell or buy/i);
});

test('a failed setup says so and offers Accept again', async () => {
  const s = setup({ acceptFails: true });
  await s.dispatch(msg({ kind: 'button', replyId: 'terms:accept' }));
  const last = s.sent.at(-1)! as Extract<OutMessage, { kind: 'buttons' }>;
  assert.equal(last.kind, 'buttons');
  assert.deepEqual(last.buttons.map((b) => b.id), ['terms:accept']);
});

test('every message records the inbound time and sends anything held back', async () => {
  const s = setup({ active: true });
  await s.dispatch(msg({ text: 'balance?' }));
  assert.equal(s.account().lastInboundAt, NOW);
  assert.equal(s.drained(), 1);
});

test('text from an account runs one turn with the conversation so far', async () => {
  const s = setup({ active: true });
  await s.dispatch(msg({ id: 'a', text: 'I build websites' }));
  await s.dispatch(msg({ id: 'b', text: 'in Lagos' }));
  assert.equal(s.chats.length, 2);
  assert.deepEqual(s.chats[1].map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(s.chats[1].at(-1)!.content, 'in Lagos');
  assert.match(bodyOf(s.sent.at(-1)!), /Hello from the agent/);
});

test('history keeps the last 20 messages', async () => {
  const s = setup({ active: true });
  for (let i = 0; i < 15; i++) await s.dispatch(msg({ id: `x${i}`, text: `m${i}` }));
  assert.ok(s.chats.at(-1)!.length <= 20);
});

test('a confirm card is sent with buttons and Confirm runs it once', async () => {
  const s = setup({ active: true, chat: async () => ({ ok: true, reply: 'Ready.', actions: [card] }) });
  await s.dispatch(msg({ text: 'release it' }));
  assert.equal(s.sent.at(-1)!.kind, 'buttons');
  await s.dispatch(msg({ id: 'c1', kind: 'button', replyId: 'confirm:act_1:n1' }));
  assert.deepEqual(s.executed, ['act_1:n1']);
  assert.match(bodyOf(s.sent.at(-1)!), /Released 250 USDC to Ada\./);
  assert.match(bodyOf(s.sent.at(-1)!), /explorer\/tx\/0xfeed/);
  await s.dispatch(msg({ id: 'c2', kind: 'button', replyId: 'confirm:act_1:n1' }));
  assert.equal(s.executed.length, 1, 'a card runs at most once');
  assert.match(bodyOf(s.sent.at(-1)!), /expired|already/i);
});

test('a step still confirming is never called done', async () => {
  const s = setup({
    active: true,
    chat: async () => ({ ok: true, reply: 'Ready.', actions: [card] }),
    execute: async () => ({ ok: true, summary: 'It is being confirmed. It is not complete yet.' }),
  });
  await s.dispatch(msg({ text: 'withdraw' }));
  await s.dispatch(msg({ id: 'c9', kind: 'button', replyId: 'confirm:act_1:n1' }));
  assert.doesNotMatch(bodyOf(s.sent.at(-1)!), /Done/);
});

test('the account is read again after the queue is drained, so drained messages are not written back', async () => {
  const s = setup({ active: true });
  await s.dispatch(msg({ text: 'hi' }));
  assert.equal(s.reads(), 2);
});

test('cancel runs nothing and says so', async () => {
  const s = setup({ active: true, chat: async () => ({ ok: true, reply: 'Ready.', actions: [card] }) });
  await s.dispatch(msg({ text: 'release it' }));
  await s.dispatch(msg({ id: 'c3', kind: 'button', replyId: 'cancel:act_1:n1' }));
  assert.equal(s.executed.length, 0);
  assert.match(bodyOf(s.sent.at(-1)!), /Nothing was done/);
});

test('a refused action shows the reason, never a success', async () => {
  const s = setup({
    active: true,
    chat: async () => ({ ok: true, reply: 'Ready.', actions: [card] }),
    execute: async () => ({ ok: false, reason: 'stale', message: 'The deal moved on. Here is the current step.' }),
  });
  await s.dispatch(msg({ text: 'release it' }));
  await s.dispatch(msg({ id: 'c4', kind: 'button', replyId: 'confirm:act_1:n1' }));
  assert.match(bodyOf(s.sent.at(-1)!), /The deal moved on/);
  assert.doesNotMatch(bodyOf(s.sent.at(-1)!), /Done/);
});

test('a turn failure sends the retry line and never an invented status', async () => {
  const s = setup({ active: true, chat: async () => ({ ok: false, error: 'assistant-unavailable' }) });
  await s.dispatch(msg({ text: 'what is my balance' }));
  assert.match(bodyOf(s.sent.at(-1)!), /couldn't check that just now/i);
});

test('a quota message from the assistant is passed on as is', async () => {
  const s = setup({ active: true, chat: async () => ({ ok: false, error: "You have reached today's assistant limit. It resets at midnight UTC.", code: 'assistant_quota_exhausted' }) });
  await s.dispatch(msg({ text: 'hi' }));
  assert.match(bodyOf(s.sent.at(-1)!), /today's assistant limit/);
});

test('a voice note is answered with a plain request to type', async () => {
  const s = setup({ active: true });
  await s.dispatch(msg({ kind: 'other' }));
  assert.match(bodyOf(s.sent.at(-1)!), /voice notes/);
  assert.equal(s.chats.length, 0);
});

test('a past client answering Yes or No is handled even without a Karwan account', async () => {
  const s = setup();
  await s.dispatch(msg({ kind: 'button', replyId: 'cw:yes:req7' }));
  assert.deepEqual(s.answers, ['req7:2348012345678:true']);
  assert.match(bodyOf(s.sent.at(-1)!), /on their record/);
  await s.dispatch(msg({ id: 'n2', kind: 'button', replyId: 'cw:no:req8' }));
  assert.deepEqual(s.answers.at(-1), 'req8:2348012345678:false');
});

test('a photo or document from an account goes to evidence intake', async () => {
  const s = setup({ active: true });
  await s.dispatch(msg({ kind: 'media', mediaId: 'm1', mimeType: 'image/jpeg' }));
  assert.match(bodyOf(s.sent.at(-1)!), /I read your invoice/);
  assert.equal(s.chats.length, 0);
});
