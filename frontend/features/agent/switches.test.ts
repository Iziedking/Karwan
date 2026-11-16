import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentMandate } from '@/core/api';
import { agentSwitchesCopy } from '@/shared/i18n/messages/agentSwitches';
import { SWITCH_ORDER, aloneRows, lockWidens, switchRows, turning } from './switches';

const mandate = (over: Partial<AgentMandate> = {}): AgentMandate => ({
  on: true,
  alone: 'agree',
  switches: { offers: true, bargain: true, agree: true, lock: false, find: true, data: true, brief: true },
  weeklyLimitUsdc: 0.25,
  brief: { on: true, hour: 7, timeZone: 'Africa/Lagos' },
  stopped: null,
  lock: null,
  ...over,
});
const RULES = { perDeal: { usdc: 31.25, said: { currency: 'NGN', amount: '50000' } }, perWeek: { usdc: 93.75 }, perDay: 3, who: 'record' as const };
const copy = agentSwitchesCopy.en.agent;
const text = { amount: (a: { usdc: number; said?: { currency: string; amount: string } }) => (a.said ? `₦${Number(a.said.amount).toLocaleString('en-US')}` : `${a.usdc} USDC`), weeklyLimit: '₦400', sells: true };

test('the switches come in the drawn order', () => {
  assert.deepEqual(SWITCH_ORDER, ['offers', 'bargain', 'agree', 'lock', 'find', 'data', 'brief']);
  assert.deepEqual(switchRows(mandate(), true).map((r) => r.name), [...SWITCH_ORDER]);
});

test('with the agent off or stopped every switch keeps its value and cannot be changed', () => {
  for (const idle of [mandate({ on: false }), mandate({ stopped: { at: 1, reason: 'locks-today' } })]) {
    const rows = switchRows(idle, true);
    assert.ok(rows.every((r) => r.disabled));
    assert.deepEqual(rows.map((r) => r.on), [true, true, true, false, true, true, true]);
  }
  assert.ok(switchRows(mandate(), true).every((r) => !r.disabled));
});

test('Lock money reads Not open yet where the network has it closed', () => {
  const lock = switchRows(mandate({ switches: { ...mandate().switches, lock: true }, lock: RULES }), false).find((r) => r.name === 'lock')!;
  assert.deepEqual(lock, { name: 'lock', on: false, disabled: true, notOpen: true });
  const open = switchRows(mandate({ switches: { ...mandate().switches, lock: true }, lock: RULES }), true).find((r) => r.name === 'lock')!;
  assert.deepEqual(open, { name: 'lock', on: true, disabled: false, notOpen: false });
});

test('turning Lock money on opens its limits, and needs Agree a price first', () => {
  assert.deepEqual(turning(mandate(), 'lock', true), { kind: 'lock-sheet' });
  assert.deepEqual(turning(mandate({ lock: RULES }), 'lock', true), { kind: 'lock-sheet' }, 'saved limits are still confirmed again');
  const noAgree = mandate({ switches: { ...mandate().switches, agree: false } });
  assert.deepEqual(turning(noAgree, 'lock', true), { kind: 'refused', why: 'needsAgree' });
  assert.deepEqual(turning(mandate(), 'lock', false), { kind: 'patch', patch: { part: 'switch', name: 'lock', on: false } });
  assert.deepEqual(turning(mandate(), 'bargain', false), { kind: 'patch', patch: { part: 'switch', name: 'bargain', on: false } });
});

test('raising a lock limit is a widening, lowering one is not', () => {
  const on = mandate({ switches: { ...mandate().switches, lock: true }, lock: RULES });
  assert.equal(lockWidens(on, { perDealUsdc: 31.25, perWeekUsdc: 93.75 }), false);
  assert.equal(lockWidens(on, { perDealUsdc: 10, perWeekUsdc: 93.75 }), false);
  assert.equal(lockWidens(on, { perDealUsdc: 31.250001, perWeekUsdc: 93.75 }), true);
  assert.equal(lockWidens(on, { perDealUsdc: 10, perWeekUsdc: 200 }), true);
  assert.equal(lockWidens(mandate({ lock: RULES }), { perDealUsdc: 1, perWeekUsdc: 1 }), true, 'turning it on always is');
});

test('Your agent has one row for each switch that is on, and names the ones that are off', () => {
  const m = mandate({ switches: { offers: true, bargain: true, agree: false, lock: false, find: true, data: true, brief: true } });
  const rows = aloneRows(m, true, copy, text);
  assert.deepEqual(rows.on.map((r) => [r.label, r.value, r.opens]), [
    ['Make offers', 'At your price', 'price'],
    ['Bargain', 'Down to your lowest', 'price'],
    ['Find people', 'On', 'reach'],
    ['Checks and research', '₦400 a week', 'money'],
    ['Morning brief', '7:00', null],
  ]);
  assert.deepEqual(rows.off.map((r) => r.label), ['Agree a price', 'Lock money']);
});

test('the Lock money row shows the figure as it was typed', () => {
  const m = mandate({ switches: { ...mandate().switches, lock: true }, lock: RULES });
  const lock = aloneRows(m, true, copy, text).on.find((r) => r.name === 'lock')!;
  assert.deepEqual([lock.value, lock.opens], ['₦50,000 a deal', 'lock']);
  const usdc = aloneRows({ ...m, lock: { ...RULES, perDeal: { usdc: 30 } } }, true, copy, text).on.find((r) => r.name === 'lock')!;
  assert.equal(usdc.value, '30 USDC a deal');
  assert.equal(aloneRows(m, false, copy, text).on.some((r) => r.name === 'lock'), false, 'closed on this network');
});

test('a buyer who sells nothing has no price to open', () => {
  const rows = aloneRows(mandate(), true, copy, { ...text, sells: false });
  assert.deepEqual(rows.on.slice(0, 2).map((r) => [r.value, r.opens]), [['At your price', null], ['Inside your limits', null]]);
});

test('every language has every switch, with no em dash and no raw placeholder left', () => {
  for (const [locale, c] of Object.entries(agentSwitchesCopy)) {
    for (const name of SWITCH_ORDER) {
      for (const s of [c.labels[name], c.notes[name], c.agent.rows[name]]) {
        assert.ok(s.length > 1, `${locale}.${name}`);
        assert.doesNotMatch(s, /—|\{\w+\}/, `${locale}.${name}`);
      }
    }
    for (const s of [c.agent.aDeal, c.agent.aWeek]) assert.match(s, /\{amount\}/, locale);
    assert.match(c.agent.offLine, /\{label\}/, locale);
    assert.match(c.agent.stopped['locks-today'], /\{n\}/, locale);
    if (locale !== 'en') assert.notEqual(c.labels.lock, agentSwitchesCopy.en.labels.lock, locale);
  }
});
