import assert from 'node:assert/strict';
import test from 'node:test';
import type { InboundMessage } from '../../channels/types.js';
import type { OutMessage } from '../../channels/render.js';
import type { TelegramAccount } from '../../db/telegramAccounts.js';
import { createTelegramHandler, type HandlerDeps } from './handler.js';
import { tapData } from './render.js';

const chat = { id: 4242, type: 'private' };
const from = { id: 4242 };
const longCard = `withdraw:0x${'1'.repeat(40)}:0x${'2'.repeat(40)}:250:n1`;

function setup(over: Partial<HandlerDeps> = {}) {
  const accounts = new Map<string, TelegramAccount>();
  const dispatched: InboundMessage[] = [];
  const sent: Array<{ to: string; m: OutMessage }> = [];
  const answered: string[] = [];
  const claimed = new Set<number>();
  const deps: HandlerDeps = {
    now: () => 1_000,
    claim: async (id) => {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
    answerCallback: async (id) => {
      answered.push(id);
    },
    linkedAddress: async () => null,
    getOrStart: async (f) => {
      const existing = accounts.get(f);
      if (existing) return existing;
      const blank: TelegramAccount = { numberHash: f, to: f, address: null, termsVersion: null, termsAt: null, lastInboundAt: null };
      accounts.set(f, blank);
      return blank;
    },
    save: async (a) => {
      accounts.set(a.numberHash, a);
      return a;
    },
    dispatch: async (m) => {
      dispatched.push(m);
    },
    question: async (id) => (id === 'cw-1' ? { subjectName: 'Ada Builds', job: 'a logo', month: 'March 2026' } : null),
    send: async (to, m) => {
      sent.push({ to, m });
    },
    ...over,
  };
  return { handle: createTelegramHandler(deps), accounts, dispatched, sent, answered };
}

test('a message is dispatched once even when Telegram delivers it twice', async () => {
  const { handle, dispatched } = setup();
  const update = { update_id: 10, message: { message_id: 1, from, chat, date: 1, text: 'hello' } };
  await handle(update);
  await handle(update);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]!.from, 'tg:4242');
});

test('a tap is acknowledged and a hashed card id resolves to the pending card', async () => {
  const { handle, accounts, dispatched, answered } = setup();
  accounts.set('tg:4242', {
    numberHash: 'tg:4242',
    to: 'tg:4242',
    address: '0xa',
    termsVersion: 'v',
    termsAt: 1,
    lastInboundAt: 1,
    activated: true,
    pendingActions: { [longCard]: { action: {} as never, expiresAt: 9_999 } },
  });
  await handle({ update_id: 11, callback_query: { id: 'cb9', from, message: { message_id: 2, chat, date: 1 }, data: tapData(`confirm:${longCard}`) } });
  assert.deepEqual(answered, ['cb9']);
  assert.equal(dispatched[0]!.replyId, `confirm:${longCard}`);
});

test('a chat linked from the web runs as that web account', async () => {
  const web = '0x00000000000000000000000000000000000000d4';
  const { handle, accounts } = setup({ linkedAddress: async () => web });
  await handle({ update_id: 12, message: { message_id: 1, from, chat, date: 1, text: 'my balance?' } });
  assert.equal(accounts.get('tg:4242')?.address, web);
  assert.equal(accounts.get('tg:4242')?.linkedWebAccount, true);
});

test('a forwarded confirmation link shows the client the question with Yes and No', async () => {
  const { handle, sent, dispatched } = setup();
  await handle({ update_id: 13, message: { message_id: 1, from, chat, date: 1, text: '/start cw_cw-1' } });
  assert.equal(dispatched.length, 0);
  const m = sent[0]!.m;
  assert.equal(m.kind, 'buttons');
  assert.match((m as { body: string }).body, /Ada Builds/);
  assert.deepEqual((m as { buttons: { id: string }[] }).buttons.map((b) => b.id), ['cw:yes:cw-1', 'cw:no:cw-1']);
});

test('a closed or unknown confirmation link says so', async () => {
  const { handle, sent } = setup();
  await handle({ update_id: 14, message: { message_id: 1, from, chat, date: 1, text: '/start cw_gone' } });
  assert.equal(sent[0]!.m.kind, 'text');
  assert.match((sent[0]!.m as { body: string }).body, /already answered|closed/);
});
