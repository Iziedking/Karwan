import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfirmAction } from '../assistant/actions.js';
import { MONEY_INTENTS, moneyStepPath } from './moneySteps.js';
import { createOpenLinks } from './openLink.js';

const JOB = `0x${'cd'.repeat(32)}`;
const card = (intent: string, payload: Record<string, unknown> = {}) => ({ kind: 'confirm', id: 'c', intent, title: 't', fields: [], payload }) as unknown as ConfirmAction;

test('every money step has a page, and each page can be opened by a one-time link', async () => {
  const links = createOpenLinks({ now: () => 0, newToken: () => 'tok', put: async () => {}, take: async () => null });
  for (const intent of MONEY_INTENTS) {
    const path = moneyStepPath(card(intent, { jobId: JOB }));
    assert.ok(path, intent);
    assert.ok(await links.mint('0xada', path), `${intent} -> ${path}`);
  }
});

test('deal steps open the deal, offer steps open the request', () => {
  assert.equal(moneyStepPath(card('fund_direct_deal', { jobId: JOB })), `/deals/${JOB}`);
  assert.equal(moneyStepPath(card('release_milestone', { jobId: JOB })), `/deals/${JOB}`);
  assert.equal(moneyStepPath(card('choose_offer', { jobId: JOB })), `/jobs/${JOB}`);
  assert.equal(moneyStepPath(card('withdraw_proceeds')), '/account');
  assert.equal(moneyStepPath(card('cash_out')), '/bridge?direction=out');
});

test('a deal step without a valid deal id has no page', () => {
  assert.equal(moneyStepPath(card('fund_direct_deal', { jobId: '0xabc' })), null);
  assert.equal(moneyStepPath(card('release_milestone')), null);
});

test('chat keeps the steps that move no money', () => {
  for (const intent of ['accept_deal', 'create_direct_deal', 'mark_delivered', 'request_extension', 'dispute_statement', 'post_request']) {
    assert.equal(MONEY_INTENTS.has(intent as ConfirmAction['intent']), false, intent);
  }
});
