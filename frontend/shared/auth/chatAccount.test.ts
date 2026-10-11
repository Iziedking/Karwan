import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isChatAccountEmail } from './chatAccount';

test('a chat account is recognised by its reserved placeholder email', () => {
  assert.equal(isChatAccountEmail('tg-ab12cd34ef56@telegram.invalid'), true);
  assert.equal(isChatAccountEmail('wa-ab12cd34ef56@whatsapp.invalid'), true);
  assert.equal(isChatAccountEmail(' TG-AB@TELEGRAM.INVALID '), true);
});

test('real emails and no email are not chat accounts', () => {
  assert.equal(isChatAccountEmail('ada@example.com'), false);
  assert.equal(isChatAccountEmail('ada@telegram.invalid.example.com'), false);
  assert.equal(isChatAccountEmail(undefined), false);
});

test('the domains match the backend list', () => {
  const backend = readFileSync(new URL('../../../backend/src/emails/chatRecipients.ts', import.meta.url), 'utf8');
  for (const domain of ['whatsapp.invalid', 'telegram.invalid']) assert.ok(backend.includes(`'${domain}'`), domain);
});

test('the account page does not send a chat account to sign-up', () => {
  const gate = readFileSync(new URL('../../features/account/ProfileGate.tsx', import.meta.url), 'utf8');
  assert.match(gate, /isChatAccountEmail\(/);
});
