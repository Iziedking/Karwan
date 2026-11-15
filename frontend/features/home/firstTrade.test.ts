import assert from 'node:assert/strict';
import test from 'node:test';
import type { SetupView } from '@/features/guide/pickNudge';
import { homeChecklist } from './firstTrade';

/// Home's checklist is the server's setup list (view 57, 15 Nov) plus Finish.

const list = (done: Partial<Record<SetupView['steps'][number]['key'], boolean>>, over: Partial<SetupView> = {}): SetupView => {
  const steps: SetupView['steps'] = [
    { key: 'setup', done: !!done.setup, href: '/setup' },
    { key: 'money', done: !!done.money, href: '/add' },
    { key: 'agent_money', done: !!done.agent_money, href: '/account?tab=agent' },
    { key: 'agent_limits', done: !!done.agent_limits, href: '/profile/setup' },
    { key: 'telegram', done: !!done.telegram, href: '/profile/contact' },
    { key: 'first_deal', done: !!done.first_deal, href: '/market' },
  ];
  const next = steps.find((s) => !s.done)?.key ?? null;
  return { steps, next, complete: next === null, known: true, ...over };
};

test('Home follows the server list and adds Finish', () => {
  const view = homeChecklist(list({ setup: true, money: true }), false);
  assert.equal(view.visible, true);
  assert.deepEqual(view.steps.map((s) => s.key), ['setup', 'money', 'agentMoney', 'agentLimits', 'telegram', 'deal', 'finish']);
  assert.equal(view.next, 'agentMoney');
  assert.equal(view.done, 2);
  assert.equal(view.dealAction, 'market');
});

test('Finish is next once the server list is complete, and the list goes once a deal settles', () => {
  const all = { setup: true, money: true, agent_money: true, agent_limits: true, telegram: true, first_deal: true };
  assert.equal(homeChecklist(list(all), false).next, 'finish');
  assert.equal(homeChecklist(list(all), true).visible, false);
});

test('hidden until the list is read and known', () => {
  assert.equal(homeChecklist(null, false).visible, false);
  assert.equal(homeChecklist(list({}), null).visible, false);
  assert.equal(homeChecklist(list({}, { known: false }), false).visible, false);
});

test('someone with their own clients starts with a payment request', () => {
  const own = list({});
  own.steps[5] = { ...own.steps[5]!, href: '/request' };
  assert.equal(homeChecklist(own, false).dealAction, 'paymentRequest');
});

test('a reply without a list is treated as not read, so Home never breaks', () => {
  assert.equal(homeChecklist({} as SetupView, false).visible, false);
  assert.equal(homeChecklist({ steps: 'x' } as unknown as SetupView, false).visible, false);
});
