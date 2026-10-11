import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('a money card becomes a one-time Karwan link with every figure, and nothing else does', async () => {
  const { createMoneyStepPresenter } = await import('./moneySteps.js');
  const present = createMoneyStepPresenter({ webBase: 'https://karwan.site', openLink: async () => 'https://karwan.site/o/tok' });
  const withdraw = { ...card('withdraw_proceeds'), title: 'Withdraw 40 USDC', fields: [{ label: 'To', value: '0xab…cd' }] } as ConfirmAction;
  const shown = await present('0xada', withdraw);
  assert.equal(shown?.kind, 'link');
  assert.equal(shown?.kind === 'link' && shown.url, 'https://karwan.site/o/tok');
  assert.match(shown?.kind === 'link' ? shown.body : '', /Withdraw 40 USDC\nTo: 0xab…cd[\s\S]*works once, within 10 minutes/);
  assert.equal(await present('0xada', card('mark_delivered')), null);
});

test('without a one-time link the card points at the page, and with no page it says to open Karwan', async () => {
  const { createMoneyStepPresenter } = await import('./moneySteps.js');
  const present = createMoneyStepPresenter({ webBase: 'https://karwan.site', openLink: async () => null });
  const shown = await present('0xada', card('cash_out'));
  assert.equal(shown?.kind === 'link' && shown.url, 'https://karwan.site/bridge?direction=out');
  assert.doesNotMatch(shown?.kind === 'link' ? shown.body : '', /works once/);
  const noPage = await present('0xada', card('release_milestone'));
  assert.equal(noPage?.kind, 'text');
});

test('no chat channel confirms money on a button', () => {
  for (const file of ['../telegram/agent/live.ts', '../whatsapp/live.ts']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(src, /createExecutor\(\{ call: callAsAccount, refuse: MONEY_INTENTS \}\)/, file);
    assert.match(src, /presentConfirm: createMoneyStepPresenter\(/, file);
  }
});
