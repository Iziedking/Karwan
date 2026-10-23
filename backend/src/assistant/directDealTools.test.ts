import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssistantAction } from './actions.js';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-deal-tools-')));
delete process.env.DATABASE_URL;

const { saveTelegramAccount } = await import('../db/telegramAccounts.js');
const { upsertProfile } = await import('../db/profiles.js');
const { directDealTools } = await import('./directDealTools.js');

const ADA = '0x00000000000000000000000000000000000000ad';
const call = { toolCallId: 't1', messages: [] };

test('a phone number with no channel that can message it asks for the Karwan tag instead', async () => {
  await saveTelegramAccount({ numberHash: 'tg-ada', to: 'tg:1', address: ADA, termsVersion: 'chat-2026-10-11', termsAt: 1, lastInboundAt: 1, activated: true });
  const actions: AssistantAction[] = [];
  const out = (await directDealTools(ADA, actions).start_protected_deal.execute!(
    { who: '+2348000000002', amountUsdc: 50, what: 'A logo', deadlineDays: 5 },
    call,
  )) as { error?: string; invited?: boolean };
  assert.match(out.error ?? '', /Karwan tag/);
  assert.equal(out.invited, undefined);
  assert.equal(actions.length, 0);
});

const BOLA = '0x00000000000000000000000000000000000000b0';
const fee = async () => 100;

test('a website account builds a deal card with every term it answered', async () => {
  await upsertProfile({ address: BOLA, role: 'seller', displayName: 'Bola Ade', handle: 'bola_designs' } as never);
  const actions: AssistantAction[] = [];
  const tools = directDealTools(ADA, actions, 'conv-1', fee);
  const out = (await tools.start_protected_deal.execute!(
    { who: '@bola_designs', what: 'Brand kit', amountUsdc: 200, deliverInDays: 7, payments: [50, 50] },
    call,
  )) as { ok?: boolean; error?: string };
  assert.equal(out.ok, true, out.error);
  assert.equal(actions.length, 1);
  const card = actions[0] as Extract<AssistantAction, { kind: 'confirm' }>;
  assert.equal(card.intent, 'create_direct_deal');
  assert.deepEqual((card.payload as { milestonePcts?: number[] }).milestonePcts, [50, 50]);
  assert.equal((card.payload as { sellerAddress?: string }).sellerAddress, BOLA);
  assert.equal((card.payload as { sourceContext?: { reference?: string } }).sourceContext?.reference, 'assistant:conv-1');
  assert.ok(card.fields.some((f) => f.label === 'You pay into escrow' && f.value.startsWith('201 USDC')));
});

test('a changed term replaces the deal card instead of adding a second', async () => {
  await upsertProfile({ address: BOLA, role: 'seller', displayName: 'Bola Ade', handle: 'bola_designs' } as never);
  const actions: AssistantAction[] = [];
  const tools = directDealTools(ADA, actions, undefined, fee);
  await tools.start_protected_deal.execute!({ who: '@bola_designs', what: 'Brand kit', amountUsdc: 200 }, call);
  await tools.start_protected_deal.execute!({ who: '@bola_designs', what: 'Brand kit', amountUsdc: 250 }, call);
  assert.equal(actions.length, 1);
  assert.equal(((actions[0] as Extract<AssistantAction, { kind: 'confirm' }>).payload as { dealAmountUsdc: number }).dealAmountUsdc, 250);
});

test('terms the deal route would refuse never become a card', async () => {
  await upsertProfile({ address: BOLA, role: 'seller', displayName: 'Bola Ade', handle: 'bola_designs' } as never);
  const actions: AssistantAction[] = [];
  const out = (await directDealTools(ADA, actions, undefined, fee).start_protected_deal.execute!(
    { who: '@bola_designs', what: 'Brand kit', amountUsdc: 200, payments: [60, 60] },
    call,
  )) as { error?: string };
  assert.match(out.error ?? '', /add up to 100/);
  assert.equal(actions.length, 0);
});

test('before the terms are complete it checks who the person is and says what is still missing', async () => {
  await upsertProfile({ address: BOLA, role: 'seller', displayName: 'Bola Ade', handle: 'bola_designs' } as never);
  const actions: AssistantAction[] = [];
  const tools = directDealTools(ADA, actions, 'conv-2', fee);
  const out = (await tools.start_protected_deal.execute!({ who: '@bola_designs', what: '3 logo designs' }, call)) as {
    ok?: boolean; seller?: string; missing?: string[];
  };
  assert.equal(out.ok, true);
  assert.equal(out.seller, 'Bola Ade · @bola_designs');
  assert.deepEqual(out.missing, ['amountUsdc']);
  assert.equal(actions.length, 0);
  const nobody = (await tools.start_protected_deal.execute!({ who: '@nobody_here' }, call)) as { error?: string };
  assert.match(nobody.error ?? '', /No Karwan account/);
});
