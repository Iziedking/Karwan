import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantAction } from '../assistant/actions.js';
import { renderTurn, type OutMessage } from './render.js';

const WEB = 'https://karwan.site';

const release = {
  kind: 'confirm',
  id: 'act_1:n9',
  intent: 'release_milestone',
  title: 'Release 250 USDC',
  summary: 'Pays Ada for the landing page.',
  warning: 'This cannot be undone.',
  fields: [{ label: 'To', value: 'Ada Builds' }, { label: 'Amount', value: '250 USDC' }],
  payload: {},
} as unknown as AssistantAction;

const buttons = (m: OutMessage) => {
  assert.equal(m.kind, 'buttons');
  return m as Extract<OutMessage, { kind: 'buttons' }>;
};

test('a plain reply is one text message', () => {
  assert.deepEqual(renderTurn('Your balance is 12 USDC.', undefined, WEB), [{ kind: 'text', body: 'Your balance is 12 USDC.' }]);
});

test('a confirm card becomes Confirm and Cancel buttons carrying its id', () => {
  const out = renderTurn('Ready when you are.', [release], WEB);
  assert.equal(out.length, 2);
  const b = buttons(out[1]);
  assert.deepEqual(b.buttons.map((x) => x.id), ['confirm:act_1:n9', 'cancel:act_1:n9']);
  assert.deepEqual(b.buttons.map((x) => x.title), ['Confirm', 'Cancel']);
});

test('the card body states the consequence, the facts and the warning', () => {
  const body = buttons(renderTurn('', [release], WEB)[0]).body;
  assert.match(body, /^\*Release 250 USDC\*/);
  assert.match(body, /Pays Ada for the landing page\./);
  assert.match(body, /To: Ada Builds/);
  assert.match(body, /Amount: 250 USDC/);
  assert.match(body, /This cannot be undone\./);
});

test('an empty reply sends only the card', () => {
  assert.equal(renderTurn('   ', [release], WEB).length, 1);
});

test('a navigate action becomes a link line in the reply', () => {
  const nav = { kind: 'navigate', id: '/wallet', label: 'Open wallet', href: '/wallet' } as unknown as AssistantAction;
  const out = renderTurn('Here it is.', [nav], WEB);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'text');
  assert.match((out[0] as Extract<OutMessage, { kind: 'text' }>).body, /Open wallet: https:\/\/karwan\.site\/wallet/);
});

test('custom labels are used and button titles never exceed 20 characters', () => {
  const card = { ...(release as object), confirmLabel: 'Release 250 USDC to Ada Builds now', cancelLabel: 'Keep it' } as unknown as AssistantAction;
  const b = buttons(renderTurn('', [card], WEB)[0]);
  for (const x of b.buttons) assert.ok(x.title.length <= 20, x.title);
  assert.equal(b.buttons[1].title, 'Keep it');
});

test('long bodies are cut at a word boundary within the WhatsApp limits', () => {
  const long = 'word '.repeat(1200).trim();
  const text = renderTurn(long, undefined, WEB);
  for (const m of text) assert.ok((m as Extract<OutMessage, { kind: 'text' }>).body.length <= 4096);
  const card = { ...(release as object), summary: long } as unknown as AssistantAction;
  const body = buttons(renderTurn('', [card], WEB)[0]).body;
  assert.ok(body.length <= 1024);
  assert.ok(!body.endsWith(' '));
});

test('a long reply is split into several messages, none lost', () => {
  const para = 'a'.repeat(3000);
  const out = renderTurn(`${para}\n\n${para}`, undefined, WEB);
  assert.equal(out.length, 2);
});
