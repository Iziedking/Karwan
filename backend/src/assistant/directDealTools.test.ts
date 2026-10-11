import assert from 'node:assert/strict';
import test from 'node:test';
import { saveTelegramAccount } from '../db/telegramAccounts.js';
import { directDealTools } from './directDealTools.js';
import type { AssistantAction } from './actions.js';

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
