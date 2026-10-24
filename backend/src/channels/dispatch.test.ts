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

function setup(opts: { active?: boolean; chat?: DispatchDeps['chat']; execute?: DispatchDeps['executeConfirm']; acceptFails?: boolean; presentConfirm?: DispatchDeps['presentConfirm']; lastInboundAt?: number; history?: Array<{ role: 'user' | 'assistant'; content: string }>; extra?: Partial<DispatchDeps> } = {}) {
  let account: WhatsappAccount = {
    numberHash: 'h1',
    to: '2348012345678',
    address: opts.active ? '0xabc' : null,
    termsVersion: opts.active ? 'chat-2026-10-10' : null,
    termsAt: opts.active ? 1 : null,
    lastInboundAt: opts.lastInboundAt ?? null,
    queue: [],
    activated: !!opts.active,
    ...(opts.history ? { history: opts.history } : {}),
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
    ...(opts.presentConfirm ? { presentConfirm: opts.presentConfirm } : {}),
    ...opts.extra,
    executeConfirm:
      opts.execute ??
      (async (_a, action) => {
        executed.push(action.id);
        return { ok: true, summary: 'Released 250 USDC to Ada.', txHash: '0xfeed' };
      }),
  };
  return { dispatch: createDispatcher(deps), save: deps.saveAccount, sent, chats, executed, account: () => account, drained: () => drained, reads: () => reads, answers };
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

test('a reply in Telegram reaches message_person as the account', async () => {
  const alert = 'A message from @ada (Nigeria) arrived. Read it with read_my_messages before answering.';
  const addresses: string[] = [];
  const chats: Array<Array<{ role: string; content: string }>> = [];
  const s = setup({
    active: true,
    history: [{ role: 'assistant', content: alert }],
    chat: async (address, messages) => {
      addresses.push(address);
      chats.push(messages);
      return { ok: true, reply: 'Sent to @ada.' };
    },
  });
  await s.dispatch(msg({ id: 'r1', text: 'Yes, ready in 5 days' }));
  assert.deepEqual(addresses, ['0xabc']);
  assert.deepEqual(chats[0], [{ role: 'assistant', content: alert }, { role: 'user', content: 'Yes, ready in 5 days' }]);
  assert.match(bodyOf(s.sent.at(-1)!), /Sent to @ada/);
});

test('a note added to the chat during a turn is kept when the turn saves', async () => {
  const marker = 'A message from @ada (Nigeria) arrived. Read it with read_my_messages before answering.';
  const s: ReturnType<typeof setup> = setup({
    active: true,
    chat: async () => {
      const now = s.account();
      await s.save({ ...now, history: [...(now.history ?? []), { role: 'assistant', content: marker }] });
      return { ok: true, reply: 'Done.' };
    },
  });
  await s.dispatch(msg({ id: 'mid', text: 'What is new?' }));
  assert.deepEqual(s.account().history?.map((h) => h.content), ['What is new?', 'Done.', marker]);
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
  // Once on arrival, once after the drain, once before saving the turn.
  assert.equal(s.reads(), 3);
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

test('a money card can be shown as a link to Karwan, and no chat button can confirm it', async () => {
  const { dispatch, sent, account } = setup({
    active: true,
    chat: async () => ({ ok: true, reply: 'Here is the release.', actions: [card] }),
    presentConfirm: async (_address, action) =>
      action.intent === 'release_milestone' ? { kind: 'link', body: 'Release 250 USDC', label: 'Open in Karwan', url: 'https://karwan.site/x' } : null,
  });
  await dispatch(msg({ text: 'release it' }));
  assert.ok(sent.some((m) => m.kind === 'link'));
  assert.equal(sent.some((m) => m.kind === 'buttons'), false);
  assert.deepEqual(account().pendingActions ?? {}, {});
});

const DAY = 24 * 3_600_000;

test('the Pause and Remove buttons reach the money controls, never the assistant', async () => {
  const taps: string[] = [];
  const s = setup({
    active: true,
    extra: {
      moneyOut: {
        noteReturn: async () => null,
        tap: async (_address, id) => {
          taps.push(id);
          return id === 'mo:pause' ? { kind: 'text', body: 'Every payment out of your account is paused.' } : null;
        },
      },
    },
  });
  await s.dispatch(msg({ kind: 'button', replyId: 'mo:pause' }));
  assert.deepEqual(taps, ['mo:pause']);
  assert.equal(s.chats.length, 0);
  assert.match(bodyOf(s.sent.at(-1)!), /paused/);
});

test('a money button from someone without an account gets the welcome, not the control', async () => {
  const taps: string[] = [];
  const s = setup({ extra: { moneyOut: { noteReturn: async () => null, tap: async (_a, id) => (taps.push(id), null) } } });
  await s.dispatch(msg({ kind: 'button', replyId: 'mo:pause' }));
  assert.deepEqual(taps, []);
  assert.match(bodyOf(s.sent.at(-1)!), /terms\/chat/);
});

test('coming back after a long silence gets the return check first, then the answer', async () => {
  const seen: Array<number | null> = [];
  const s = setup({
    active: true,
    lastInboundAt: NOW - 61 * DAY,
    extra: {
      moneyOut: {
        noteReturn: async (_address, previous) => {
          seen.push(previous);
          return { kind: 'text', body: 'Welcome back. Confirm it is still you with your World ID.' };
        },
        tap: async () => null,
      },
    },
  });
  await s.dispatch(msg({ text: 'send 50 USDC to my bank' }));
  assert.deepEqual(seen, [NOW - 61 * DAY], 'asked with the previous message time, before it is overwritten');
  assert.match(bodyOf(s.sent[0]!), /Welcome back/);
  assert.match(bodyOf(s.sent.at(-1)!), /Hello from the agent/);
});

test('a channel can add one tip to the first message after joining', async () => {
  const s = setup({ extra: { joinedTip: 'Turn on Two-Step Verification in Telegram.' } });
  await s.dispatch(msg({ kind: 'button', replyId: 'terms:accept' }));
  assert.match(bodyOf(s.sent.at(-1)!), /what you sell or buy[\s\S]*Two-Step Verification/);
});

test('/delete and its buttons go to the deletion, never the assistant', async () => {
  const calls: string[] = [];
  const s = setup({
    active: true,
    extra: {
      deletion: {
        command: async (address) => {
          calls.push(`command:${address}`);
          return { kind: 'text', body: 'Delete your Karwan account?' };
        },
        tap: async (address, id) => {
          calls.push(`tap:${address}:${id}`);
          return id.startsWith('del:') ? { kind: 'text', body: 'Cancelled. Your account stays.' } : null;
        },
      },
    },
  });
  await s.dispatch(msg({ text: '/delete' }));
  await s.dispatch(msg({ kind: 'button', replyId: 'del:cancel' }));
  assert.deepEqual(calls, ['command:0xabc', 'tap:0xabc:del:cancel']);
  assert.equal(s.chats.length, 0);
  assert.match(bodyOf(s.sent.at(-1)!), /Cancelled/);

  await s.dispatch(msg({ text: 'please delete my account' }));
  assert.equal(s.chats.length, 1, 'words go to the agent, which tells them to send /delete');
});

test('/delete from someone without an account gets the welcome', async () => {
  const calls: string[] = [];
  const s = setup({
    extra: { deletion: { command: async (a) => (calls.push(a), { kind: 'text', body: 'x' }), tap: async () => null } },
  });
  await s.dispatch(msg({ text: '/delete' }));
  assert.deepEqual(calls, []);
  assert.match(bodyOf(s.sent.at(-1)!), /terms\/chat/);
});

test('after joining, the agent asks whether agents may check the record, then about other platforms', async () => {
  const consents: Array<Record<string, boolean>> = [];
  const consent = async (_address: string, patch: Record<string, boolean>) => {
    consents.push(patch);
  };
  const { dispatch, sent } = setup({ extra: { consent } });
  await dispatch(msg({ replyId: 'terms:accept' }));
  const ask = sent.find((m) => m.kind === 'buttons' && m.body.includes('Agents from other apps'));
  assert.ok(ask && ask.kind === 'buttons');
  assert.deepEqual(ask.buttons.map((b) => b.id), ['rc:readable:yes', 'rc:readable:no']);

  await dispatch(msg({ replyId: 'rc:readable:yes' }));
  assert.deepEqual(consents[0], { outsideReadable: true });
  const next = sent.at(-1)!;
  assert.ok(next.kind === 'buttons' && next.buttons[0]!.id === 'rc:lookup:yes');

  await dispatch(msg({ replyId: 'rc:lookup:no' }));
  assert.deepEqual(consents[1], { sourceLookup: false });
  assert.match(sent.at(-1)!.kind === 'text' ? (sent.at(-1) as { body: string }).body : '', /change this any time in Profile/);
});

test('with onboarding wired, an account still signing in never reaches the assistant', async () => {
  const s = setup({
    extra: {
      onboarding: { handle: async (a) => ({ account: { ...a, onboarding: { step: 'choose' } }, out: [{ kind: 'text', body: 'Choose.' }] }) },
    },
  });
  await s.dispatch(msg({ text: 'hi' }));
  assert.equal(s.chats.length, 0);
  assert.equal(bodyOf(s.sent.at(-1)!), 'Choose.');
  assert.equal(s.account().onboarding?.step, 'choose');
});

test('a hand-off from onboarding runs one assistant turn in the person\'s words', async () => {
  const s = setup({
    active: true,
    extra: {
      onboarding: { handle: async (a) => ({ account: a, out: [{ kind: 'text', body: 'Got it.' }], handOff: 'I sell: logos. Post this as my offer.' }) },
    },
  });
  await s.dispatch(msg({ text: '50 USDC, 3 days' }));
  assert.equal(s.chats.length, 1);
  assert.equal(s.chats[0]!.at(-1)!.content, 'I sell: logos. Post this as my offer.');
});

test('a pass-through note is sent and the message still reaches the assistant', async () => {
  const s = setup({
    active: true,
    extra: {
      onboarding: { handle: async (a) => ({ account: { ...a, emailAsked: true }, out: [{ kind: 'text', body: 'Add your email.' }], passThrough: true }) },
    },
  });
  await s.dispatch(msg({ text: 'find me a designer' }));
  assert.equal(s.sent[0] && bodyOf(s.sent[0]), 'Add your email.');
  assert.equal(s.chats.length, 1);
  assert.equal(s.account().emailAsked, true);
});

const FINDABLE = { kind: 'buttons' as const, body: 'Can people find you here by your Telegram name?', buttons: [{ id: 'rc:findable:yes', title: 'Yes' }, { id: 'rc:findable:no', title: 'Not now' }] };

test('after the lookup question the findable question follows', async () => {
  const s = setup({ active: true, extra: { consent: async () => {}, findable: FINDABLE } });
  await s.dispatch(msg({ kind: 'button', replyId: 'rc:lookup:yes' }));
  assert.equal(bodyOf(s.sent.at(-1)!), FINDABLE.body);
  assert.equal(s.account().findableAsked, true);
});

test('the findable answer is saved on the account', async () => {
  const s = setup({ active: true, extra: { consent: async () => {}, findable: FINDABLE } });
  await s.dispatch(msg({ kind: 'button', replyId: 'rc:findable:yes' }));
  assert.equal(s.account().findable, true);
  assert.equal(s.account().findableAsked, true);
  await s.dispatch(msg({ kind: 'button', replyId: 'rc:findable:no' }));
  assert.equal(s.account().findable, false);
});

test('an account that never answered is asked once, and its message still reaches the agent', async () => {
  const s = setup({ active: true, extra: { consent: async () => {}, findable: FINDABLE } });
  await s.dispatch(msg({ text: 'find me a designer' }));
  assert.equal(bodyOf(s.sent[0]!), FINDABLE.body);
  assert.equal(s.chats.length, 1);
  const count = s.sent.length;
  await s.dispatch(msg({ text: 'and a printer' }));
  assert.equal(s.sent.slice(count).some((m) => bodyOf(m) === FINDABLE.body), false);
});

test('without the findable question wired nothing extra is asked', async () => {
  const s = setup({ active: true, extra: { consent: async () => {} } });
  await s.dispatch(msg({ text: 'hello' }));
  assert.equal(s.sent.some((m) => bodyOf(m) === FINDABLE.body), false);
});

test('a number replied to a shortlist reaches the assistant as that choice, not a rating', async () => {
  const s = setup({ active: true });
  await s.save({
    ...s.account(),
    choices: { kind: 'shortlist', jobId: '0xjob', at: NOW - 33 * 60_000, options: [{ n: 5, seller: '0xseller5', name: 'grachi @grachidefi', priceUsdc: 114.95 }] },
  });
  await s.dispatch(msg({ text: '5' }));
  const last = s.chats.at(-1)?.at(-1)?.content ?? '';
  assert.match(last, /^I choose number 5 on my shortlist for request 0xjob: grachi @grachidefi at 114\.95 USDC \(seller 0xseller5\)/);
  await s.dispatch(msg({ text: 'rate my deal with @lawful 5 stars' }));
  assert.equal(s.chats.at(-1)?.at(-1)?.content, 'rate my deal with @lawful 5 stars');
});
