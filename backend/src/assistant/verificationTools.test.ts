import assert from 'node:assert/strict';
import test from 'node:test';
import { installVerificationServices } from '../verification/services.js';
import type { createClientConfirm } from '../verification/clientConfirm.js';
import type { createCacReview } from '../verification/cac.js';
import { verificationTools } from './verificationTools.js';

const ADA = '0x00000000000000000000000000000000000000ad';
const call = { toolCallId: 't1', messages: [] };

function install(sendsToNumbers: boolean) {
  const calls: string[] = [];
  installVerificationServices({
    sendsToNumbers,
    confirmLink: (id) => `https://t.me/karwan_bot?start=cw_${id}`,
    clientConfirm: {
      request: async () => {
        calls.push('number');
        return { ok: true as const, requestId: 'n1' };
      },
      requestByLink: async () => {
        calls.push('link');
        return { ok: true as const, requestId: 'cw-1' };
      },
    } as unknown as ReturnType<typeof createClientConfirm>,
    cac: {} as ReturnType<typeof createCacReview>,
  });
  return calls;
}

test('without a channel that messages numbers, a past client gets a link to open', async () => {
  const calls = install(false);
  const out = (await verificationTools(ADA).ask_past_client_to_confirm.execute!(
    { clientWhatsapp: '+2348000000002', job: 'a logo', month: 'March 2026' },
    call,
  )) as { ok: boolean; link?: string };
  assert.deepEqual(calls, ['link']);
  assert.equal(out.link, 'https://t.me/karwan_bot?start=cw_cw-1');
});

test('with WhatsApp sending and a number, the client is messaged directly', async () => {
  const calls = install(true);
  const out = (await verificationTools(ADA).ask_past_client_to_confirm.execute!(
    { clientWhatsapp: '+2348000000002', job: 'a logo', month: 'March 2026' },
    call,
  )) as { ok: boolean; sent?: boolean };
  assert.deepEqual(calls, ['number']);
  assert.equal(out.sent, true);
});
