import assert from 'node:assert/strict';
import test from 'node:test';
import { renderConfirm } from '../../channels/render.js';
import type { ConfirmAction } from '../../assistant/actions.js';
import { resolveTap, tapData, toTelegram } from './render.js';

const longId = `withdraw:0x${'1'.repeat(40)}:0x${'2'.repeat(40)}:250:abcdef123456`;
const card = {
  kind: 'confirm',
  id: longId,
  intent: 'withdraw_proceeds',
  title: 'Withdraw 250 USDC',
  summary: 'To your own wallet',
  fields: [{ label: 'Amount', value: '250 USDC' }],
  warning: 'A withdrawal cannot be undone.',
  payload: {},
} as unknown as ConfirmAction;

test('a confirm card becomes plain text with two callback buttons that fit in 64 bytes', () => {
  const [msg] = toTelegram(renderConfirm(card))!;
  assert.equal(msg!.parse_mode, undefined);
  assert.ok(msg!.text.startsWith('Withdraw 250 USDC'), 'no markdown asterisks');
  const row = msg!.reply_markup!.inline_keyboard[0]!;
  assert.equal(row.length, 2);
  for (const b of row) assert.ok(Buffer.byteLength(b.callback_data, 'utf8') <= 64, b.callback_data);
});

test('a hashed tap resolves back to the full card among the pending ones', () => {
  const pending = [`confirm:${longId}`, `cancel:${longId}`, 'confirm:other'];
  assert.equal(resolveTap(tapData(`confirm:${longId}`), pending), `confirm:${longId}`);
  assert.equal(resolveTap(tapData(`cancel:${longId}`), pending), `cancel:${longId}`);
  assert.equal(resolveTap(tapData('confirm:gone'), pending), tapData('confirm:gone'));
});

test('short ids pass through untouched', () => {
  assert.equal(tapData('terms:accept'), 'terms:accept');
  assert.equal(tapData('cw:yes:req1'), 'cw:yes:req1');
});

test('plain text goes out as is, with link previews off', () => {
  const [msg] = toTelegram({ kind: 'text', body: 'Hello *there*' })!;
  assert.equal(msg!.text, 'Hello *there*');
  assert.deepEqual(msg!.link_preview_options, { is_disabled: true });
});

test('a WhatsApp template has no Telegram form and is not sent', () => {
  assert.equal(toTelegram({ kind: 'template', name: 'deal_update', params: ['x'] }), null);
});

test('a money step becomes a link button, not a Mini App and not a callback', () => {
  const [msg] = toTelegram({ kind: 'link', body: 'Pay 80 USDC into escrow', label: 'Open in Karwan', url: 'https://testnet.karwan.site/x' })!;
  assert.deepEqual(msg!.reply_markup, { inline_keyboard: [[{ text: 'Open in Karwan', url: 'https://testnet.karwan.site/x' }]] });
  assert.equal(JSON.stringify(msg).includes('web_app'), false);
});

test('bold the model wrote with double asterisks arrives as bold, never as raw asterisks', () => {
  const [msg] = toTelegram({ kind: 'text', body: 'Your balance is **1,621.21 USDC**.\n\nStaked: **7,050 USDC** 🔒' })!;
  assert.equal(msg!.text, 'Your balance is 1,621.21 USDC.\n\nStaked: 7,050 USDC 🔒');
  assert.deepEqual(msg!.entities, [
    { type: 'bold', offset: 16, length: 13 },
    { type: 'bold', offset: 40, length: 10 },
  ]);
  assert.equal(msg!.parse_mode, undefined);
});

test('entity offsets count UTF-16 units, so an emoji before the bold does not shift it', () => {
  const [msg] = toTelegram({ kind: 'text', body: '🎉 **Paid**' })!;
  assert.equal(msg!.text, '🎉 Paid');
  assert.deepEqual(msg!.entities, [{ type: 'bold', offset: 3, length: 4 }]);
});

test('text without bold carries no entities and a lone asterisk stays as typed', () => {
  const [msg] = toTelegram({ kind: 'text', body: 'Price is 5 * 2 USDC' })!;
  assert.equal(msg!.text, 'Price is 5 * 2 USDC');
  assert.equal(msg!.entities, undefined);
});
